import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sectionSchema } from '@/lib/validations/master'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = sectionSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const row = await prisma.section.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ data: row })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : ''
    if (code === 'P2002') return NextResponse.json({ error: 'รหัสส่วนซ้ำ' }, { status: 409 })
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const s = await prisma.section.findUnique({
      where: { id },
      include: { _count: { select: { lines: true, users: true } } },
    })
    if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (s._count.lines > 0 || s._count.users > 0) {
      return NextResponse.json(
        {
          error: `ลบไม่ได้: มีสายผลิต ${s._count.lines} สาย และผู้ใช้ ${s._count.users} คนอ้างอิงส่วนนี้ — ย้ายข้อมูลก่อน`,
        },
        { status: 400 },
      )
    }
    await prisma.section.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
