import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { auditUserIdFromSession } from '@/lib/audit-user'
import { parseThaiLocalToUtc } from '@/lib/time-utils'
import { z } from 'zod'
import { checkPermissionForSession } from '@/lib/permissions/guard'
const updateSchema = z.object({
  okQty: z.number().int().min(0).optional(),
  remark: z.string().optional(),
  partId: z.string().optional(),
  breakdown: z.array(z.object({
    breakdownStart: z.string().min(1),
    breakdownEnd: z.string().optional(),
    breakTimeMin: z.number().int().min(1),
    problemCategoryId: z.string().min(1),
    problemDetail: z.string().optional(),
    actionTaken: z.string().optional(),
    machineId: z.string().optional(),
  })).optional(),
  ng: z.array(z.object({
    ngQty: z.number().int().min(1),
    problemCategoryId: z.string().min(1),
    problemDetail: z.string().optional(),
    actionTaken: z.string().optional(),
    machineId: z.string().optional(),
  })).optional(),
})

type Params = { params: Promise<{ id: string }> }

function normalizeBreakdownEntries(entries: NonNullable<z.infer<typeof updateSchema>['breakdown']>) {
  return entries.map((bd, index) => {
    const breakdownStart = parseThaiLocalToUtc(bd.breakdownStart)
    if (!breakdownStart) {
      throw new Error(`เวลาเริ่ม Breakdown แถวที่ ${index + 1} ไม่ถูกต้อง`)
    }

    const breakdownEnd = bd.breakdownEnd ? parseThaiLocalToUtc(bd.breakdownEnd) : null
    if (bd.breakdownEnd && !breakdownEnd) {
      throw new Error(`เวลาสิ้นสุด Breakdown แถวที่ ${index + 1} ไม่ถูกต้อง`)
    }

    if (!breakdownEnd) {
      return {
        ...bd,
        breakdownStart,
        breakdownEnd: null,
      }
    }

    const breakTimeMin = Math.round((breakdownEnd.getTime() - breakdownStart.getTime()) / 60_000)
    if (breakTimeMin <= 0) {
      throw new Error(`เวลา Breakdown แถวที่ ${index + 1} ต้องมากกว่า 0 นาที`)
    }
    if (breakTimeMin !== bd.breakTimeMin) {
      throw new Error(`เวลา Breakdown แถวที่ ${index + 1} ไม่สอดคล้องกับจำนวนนาที`)
    }

    return {
      ...bd,
      breakdownStart,
      breakdownEnd,
      breakTimeMin,
    }
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const data = await prisma.hourlyRecord.findUnique({
    where: { id },
    include: {
      part:          true,
      machine:       true,
      operator:      { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      session: {
        select: {
          lineId:      true,
          reportingDate: true,
          sessionDate: true,
          shiftType:   true,
          line:        { select: { id: true, lineCode: true, lineName: true } },
        },
      },
      breakdownLogs: { include: { problemCategory: true } },
      ngLogs:        { include: { problemCategory: true } },
      modelChange:   true,
    },
  })

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canWrite = await checkPermissionForSession(session, 'api.production.record.write', { apiPath: req.nextUrl.pathname })
    if (!canWrite) {
      return NextResponse.json(
        { error: 'แก้ไขได้เฉพาะหัวหน้างาน / วิศวกร / ผู้จัดการ / Admin' },
        { status: 403 },
      )
    }

    const { id } = await params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const data = parsed.data
    const shouldReplaceBreakdown = Object.prototype.hasOwnProperty.call(body, 'breakdown')
    const shouldReplaceNg = Object.prototype.hasOwnProperty.call(body, 'ng')

    const existing = await prisma.hourlyRecord.findUnique({
      where: { id },
      include: {
        session: { select: { lineId: true } },
        breakdownLogs: true,
        ngLogs: true,
      },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const auditUserId = await auditUserIdFromSession(session)

    let breakdownData: ReturnType<typeof normalizeBreakdownEntries> = []
    if (shouldReplaceBreakdown) {
      try {
        breakdownData = data.breakdown ? normalizeBreakdownEntries(data.breakdown) : []
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'ข้อมูล Breakdown ไม่ถูกต้อง' },
          { status: 400 },
        )
      }
    }

    const ngData = shouldReplaceNg ? (data.ng?.filter(ng => ng.problemCategoryId && ng.ngQty > 0) ?? []) : []

    const hasBreakdown = shouldReplaceBreakdown ? breakdownData.length > 0 : existing.breakdownLogs.length > 0
    const hasNg = shouldReplaceNg ? ngData.length > 0 : existing.ngLogs.length > 0

    const lineId = existing.session?.lineId
    const lineMachineIds =
      lineId ?
        await prisma.machine.findMany({
          where: { lineId },
          select: { id: true },
        })
      : []
    const lineMachineIdSet = new Set(lineMachineIds.map(m => m.id))
    const requireMachineOnLine = lineId && lineMachineIdSet.size > 0

    if (requireMachineOnLine && shouldReplaceBreakdown && breakdownData.length > 0) {
      for (let i = 0; i < breakdownData.length; i++) {
        const bd = breakdownData[i]!
        const mid = (bd as { machineId?: string | null }).machineId?.trim()
        if (!mid) {
          return NextResponse.json(
            { error: `Breakdown แถวที่ ${i + 1}: กรุณาเลือกเครื่องจักร` },
            { status: 400 },
          )
        }
        if (!lineMachineIdSet.has(mid)) {
          return NextResponse.json(
            { error: `Breakdown แถวที่ ${i + 1}: เครื่องจักรไม่อยู่ใน Line ของ Session` },
            { status: 400 },
          )
        }
      }
    }
    if (requireMachineOnLine && shouldReplaceNg && ngData.length > 0) {
      for (let i = 0; i < ngData.length; i++) {
        const ng = ngData[i]!
        const mid = ng.machineId?.trim()
        if (!mid) {
          return NextResponse.json(
            { error: `NG แถวที่ ${i + 1}: กรุณาเลือกเครื่องจักร` },
            { status: 400 },
          )
        }
        if (!lineMachineIdSet.has(mid)) {
          return NextResponse.json(
            { error: `NG แถวที่ ${i + 1}: เครื่องจักรไม่อยู่ใน Line ของ Session` },
            { status: 400 },
          )
        }
      }
    }

    const nextPartId = data.partId !== undefined ? data.partId : existing.partId
    let targetQty    = existing.targetQty
    if (nextPartId !== existing.partId) {
      // ใช้ LinePartTarget (line-centric) แทน MachinePartTarget
      const target = lineId
        ? await prisma.linePartTarget.findFirst({
            where: { lineId, partId: nextPartId, isActive: true },
            orderBy: { effectiveDate: 'desc' },
          })
        : null
      targetQty = target?.piecesPerHour ?? 0
    }

    const updatePayload: Parameters<typeof prisma.hourlyRecord.update>[0]['data'] = {
      okQty:  data.okQty !== undefined ? data.okQty : existing.okQty,
      partId: nextPartId,
      targetQty,
      remark: data.remark !== undefined ? data.remark : existing.remark,
    }

    if (shouldReplaceBreakdown) {
      updatePayload.hasBreakdown = hasBreakdown
      updatePayload.breakdownLogs = {
        create: breakdownData.map(bd => ({
          breakdownStart:    bd.breakdownStart,
          breakdownEnd:      bd.breakdownEnd,
          breakTimeMin:      bd.breakTimeMin,
          problemCategoryId: bd.problemCategoryId,
          problemDetail:     bd.problemDetail,
          actionTaken:       bd.actionTaken,
          machineId:         (bd as { machineId?: string | null }).machineId?.trim() ?? null,
        })),
      }
    }
    if (shouldReplaceNg) {
      updatePayload.hasNg = hasNg
      updatePayload.ngLogs = {
        create: ngData.map(ng => ({
          machineId:         ng.machineId?.trim() ?? null,
          ngQty:             ng.ngQty,
          problemCategoryId: ng.problemCategoryId,
          problemDetail:     ng.problemDetail,
          actionTaken:       ng.actionTaken,
        })),
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldReplaceBreakdown) {
        await tx.breakdownLog.deleteMany({ where: { hourlyRecordId: id } })
      }
      if (shouldReplaceNg) {
        await tx.ngLog.deleteMany({ where: { hourlyRecordId: id } })
      }

      return tx.hourlyRecord.update({
        where: { id },
        data: updatePayload,
        include: { breakdownLogs: true, ngLogs: true },
      })
    })

    await prisma.auditLog.create({
      data: {
        userId:   auditUserId,
        action:   'UPDATE_RECORD',
        entity:   'hourly_records',
        entityId: id,
        details:  { okQty: data.okQty, hourSlot: existing.hourSlot },
      },
    })

    return NextResponse.json({ data: updated })
  } catch (e: any) {
    console.error('PUT /api/production/records/[id]', e)
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canWrite = await checkPermissionForSession(session, 'api.production.record.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.breakdownLog.deleteMany({ where: { hourlyRecordId: id } })
  await prisma.ngLog.deleteMany({ where: { hourlyRecordId: id } })
  await prisma.modelChange.deleteMany({ where: { hourlyRecordId: id } })
  await prisma.hourlyRecord.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
