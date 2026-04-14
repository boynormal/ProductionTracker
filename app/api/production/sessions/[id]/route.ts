import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { sessionUpdateSchema } from '@/lib/validations/production'
import { auditUserIdFromSession } from '@/lib/audit-user'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const data = await prisma.productionSession.findUnique({
    where: { id },
    include: {
      machine:  true,
      line:     true,
      operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      hourlyRecords: {
        include: {
          part:          true,
          breakdownLogs: { include: { problemCategory: true } },
          ngLogs:        { include: { problemCategory: true } },
          modelChange:   true,
        },
        orderBy: { hourSlot: 'asc' },
      },
    },
  })

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.production.session.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body   = await req.json()
  const parsed = sessionUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const existing = await prisma.productionSession.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updateData: any = {}
  const d = parsed.data

  if (d.status)  updateData.status  = d.status
  if (d.remark !== undefined) updateData.remark = d.remark
  if (d.otHours !== undefined) {
    updateData.otHours    = d.otHours
    updateData.totalHours = existing.normalHours + d.otHours
  }
  if (d.status === 'COMPLETED') {
    updateData.endTime = d.endTime ? new Date(d.endTime as string) : new Date()
  }

  const updated = await prisma.productionSession.update({
    where: { id },
    data: updateData,
  })

  const auditUid = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUid,
      action: d.status === 'COMPLETED' ? 'COMPLETE_SESSION' : d.status === 'CANCELLED' ? 'CANCEL_SESSION' : 'UPDATE_SESSION',
      entity: 'production_sessions',
      entityId: id,
      details: updateData,
    },
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.production.session.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.ngLog.deleteMany({ where: { hourlyRecord: { sessionId: id } } })
  await prisma.breakdownLog.deleteMany({ where: { hourlyRecord: { sessionId: id } } })
  await prisma.modelChange.deleteMany({ where: { sessionId: id } })
  await prisma.hourlyRecord.deleteMany({ where: { sessionId: id } })
  await prisma.productionSession.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
