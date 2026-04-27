import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
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

  const d = parsed.data
  const isReopenShift =
    d.status === 'IN_PROGRESS' && existing.status === 'COMPLETED'

  if (d.status === 'IN_PROGRESS' && existing.status === 'CANCELLED') {
    return NextResponse.json(
      { error: 'ไม่สามารถเปิดกะจากสถานะยกเลิกได้' },
      { status: 400 },
    )
  }

  if (isReopenShift) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { role: true, isActive: true },
    })
    if (!dbUser?.isActive || dbUser.role !== 'ADMIN') {
      return NextResponse.json(
        {
          error:
            'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ยกเลิกปิดกะได้ — Only ADMIN may reopen a completed shift.',
        },
        { status: 403 },
      )
    }

    const oppositeShift = existing.shiftType === 'NIGHT' ? 'DAY' : 'NIGHT'
    const conflictingOpenSession = await prisma.productionSession.findFirst({
      where: {
        id: { not: existing.id },
        lineId: existing.lineId,
        sessionDate: existing.sessionDate,
        shiftType: oppositeShift,
        status: 'IN_PROGRESS',
      },
      select: { id: true },
    })

    if (conflictingOpenSession) {
      return NextResponse.json(
        {
          error:
            oppositeShift === 'NIGHT'
              ? 'ยังมี Session กะดึกเปิดอยู่ (IN_PROGRESS) — กรุณาปิดกะดึกในระบบก่อนเปิดกะเช้า'
              : 'ยังมี Session กะเช้าเปิดอยู่ (IN_PROGRESS) — กรุณาปิดกะเช้าในระบบก่อนเปิดหรือบันทึกกะดึก',
          code: oppositeShift === 'NIGHT' ? 'NIGHT_SESSION_STILL_OPEN' : 'DAY_SESSION_STILL_OPEN',
        },
        { status: 409 },
      )
    }
  }

  const updateData: Record<string, unknown> = {}

  if (d.status) updateData.status = d.status
  if (d.remark !== undefined) updateData.remark = d.remark
  if (d.otHours !== undefined) {
    updateData.otHours = d.otHours
    updateData.totalHours = existing.normalHours + d.otHours
  }
  if (d.status === 'COMPLETED') {
    updateData.endTime = d.endTime ? new Date(d.endTime as string) : new Date()
  }
  if (isReopenShift) {
    updateData.endTime = null
  }

  const updated = await prisma.productionSession.update({
    where: { id },
    data: updateData,
  })

  const auditUid = await auditUserIdFromSession(session)
  const auditAction =
    d.status === 'COMPLETED'
      ? 'COMPLETE_SESSION'
      : d.status === 'CANCELLED'
        ? 'CANCEL_SESSION'
        : isReopenShift
          ? 'REOPEN_SESSION'
          : 'UPDATE_SESSION'
  const auditDetails = isReopenShift
    ? {
        ...updateData,
        previousStatus: existing.status,
        lineId: existing.lineId,
        sessionDate: existing.sessionDate.toISOString(),
        shiftType: existing.shiftType,
      }
    : updateData

  await prisma.auditLog.create({
    data: {
      userId: auditUid,
      action: auditAction,
      entity: 'production_sessions',
      entityId: id,
      details: auditDetails as Prisma.InputJsonValue,
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
