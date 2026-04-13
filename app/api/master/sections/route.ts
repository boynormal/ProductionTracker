import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sectionSchema } from '@/lib/validations/master'

function canEditOrg(role: string | undefined) {
  return role === 'ADMIN' || role === 'MANAGER'
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.section.findMany({
      orderBy: { sectionCode: 'asc' },
      include: {
        division: { include: { department: true } },
        _count: { select: { lines: true, users: true } },
      },
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
  if (!canEditOrg(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = sectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const row = await prisma.section.create({ data: parsed.data })
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : ''
    if (code === 'P2002') return NextResponse.json({ error: 'รหัสส่วนซ้ำ' }, { status: 409 })
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
