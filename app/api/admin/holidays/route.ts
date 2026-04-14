import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { holidaySchema } from '@/lib/validations/master'
import { auditUserIdFromSession } from '@/lib/audit-user'
import { checkPermissionForSession } from '@/lib/permissions/guard'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canRead = await checkPermissionForSession(session, 'api.admin.holidays.read', { apiPath: req.nextUrl.pathname })
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const holidays = await prisma.holiday.findMany({
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ data: holidays })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.admin.holidays.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = holidaySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const dateStr = typeof data.date === 'string' ? data.date : data.date.toISOString().slice(0, 10)
  const dateValue = new Date(dateStr + 'T00:00:00Z')

  const existing = await prisma.holiday.findFirst({ where: { date: dateValue } })
  if (existing) {
    return NextResponse.json({ error: 'Holiday already exists on this date' }, { status: 409 })
  }

  const holiday = await prisma.holiday.create({
    data: {
      date: dateValue,
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
    },
  })

  const auditUid = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUid,
      action: 'CREATE_HOLIDAY',
      entity: 'holidays',
      entityId: holiday.id,
    },
  })

  return NextResponse.json({ data: holiday }, { status: 201 })
}
