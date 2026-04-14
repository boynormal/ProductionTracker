import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { departmentSchema } from '@/lib/validations/master'
import { checkPermissionForSession } from '@/lib/permissions/guard'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.department.findMany({
      orderBy: { departmentCode: 'asc' },
      include: { _count: { select: { divisions: true } } },
    })
    return NextResponse.json({ data: rows })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = departmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const row = await prisma.department.create({ data: parsed.data })
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002'
      ? 'รหัสแผนกซ้ำ'
      : 'Internal server error'
    console.error(e)
    return NextResponse.json({ error: msg }, { status: msg.includes('ซ้ำ') ? 409 : 500 })
  }
}
