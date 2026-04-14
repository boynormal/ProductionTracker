import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { holidaySchema } from '@/lib/validations/master'
import { auditUserIdFromSession } from '@/lib/audit-user'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const holiday = await prisma.holiday.findUnique({ where: { id } })
  if (!holiday) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: holiday })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.admin.holidays.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json()
  const parsed = holidaySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const dateStr = typeof data.date === 'string' ? data.date : data.date.toISOString().slice(0, 10)
  const dateValue = new Date(dateStr + 'T00:00:00Z')

  const existing = await prisma.holiday.findFirst({
    where: { date: dateValue, id: { not: id } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Holiday already exists on this date' }, { status: 409 })
  }

  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      date: dateValue,
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    },
  })

  const auditUidPut = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUidPut,
      action: 'UPDATE_HOLIDAY',
      entity: 'holidays',
      entityId: id,
    },
  })

  return NextResponse.json({ data: holiday })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.admin.holidays.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  await prisma.holiday.delete({ where: { id } })

  const auditUidDel = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUidDel,
      action: 'DELETE_HOLIDAY',
      entity: 'holidays',
      entityId: id,
    },
  })

  return NextResponse.json({ message: 'Holiday deleted' })
}
