import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { isUserEligibleForPart } from '@/lib/user-part-eligibility'
import { auditUserIdFromDbUserId } from '@/lib/audit-user'
import { z } from 'zod'
import { getCurrentShift, getCurrentHourSlot } from '@/lib/utils/shift'
import {
  parseThaiCalendarDateUtc,
  dayEndExclusiveUTC,
  parseThaiLocalToUtc,
  getThaiReportingDateUTC,
} from '@/lib/time-utils'
import { checkPermission } from '@/lib/permissions/guard'

const schema = z.object({
  sessionId:      z.string(),
  hourSlot:       z.number().int().min(1).max(11),
  partId:         z.string(),
  machineId:      z.string().optional(),
  okQty:          z.number().int().min(0),
  remark:         z.string().optional(),
  breakdown: z.array(z.object({
    breakdownStart:    z.string().min(1),
    breakdownEnd:      z.string().optional(),
    breakTimeMin:      z.number().int().min(1),
    problemCategoryId: z.string().min(1),
    problemDetail:     z.string().optional(),
    actionTaken:       z.string().optional(),
    machineId:         z.string().optional(),
  })).optional(),
  ng: z.array(z.object({
    ngQty:             z.number().int().min(1),
    problemCategoryId: z.string(),
    problemDetail:     z.string().optional(),
    actionTaken:       z.string().optional(),
    machineId:         z.string().optional(),
  })).optional(),
  /** ผู้ลงชื่อในบันทึกรายชั่วโมง — ถ้าไม่ส่ง ใช้ผู้ที่ล็อกอิน/สแกน */
  recordOperatorId: z.string().optional(),
})

function formatUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function normalizeBreakdownEntries(entries: NonNullable<z.infer<typeof schema>['breakdown']>) {
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

export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.source === 'scan') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const date      = searchParams.get('date')
  const page      = parseInt(searchParams.get('page') ?? '1')
  const limit     = parseInt(searchParams.get('limit') ?? '20')

  const where: any = {}
  if (sessionId) where.sessionId = sessionId
  if (date) {
    const dayStart = parseThaiCalendarDateUtc(date)
    if (!dayStart) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    where.recordTime = {
      gte: dayStart,
      lt:  dayEndExclusiveUTC(dayStart),
    }
  }

  const [records, total] = await Promise.all([
    prisma.hourlyRecord.findMany({
      where,
      include: {
        session:  { include: { line: true, machine: true } },
        part:     true,
        machine:  true,
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        breakdownLogs: { include: { problemCategory: true } },
        ngLogs:        { include: { problemCategory: true } },
        modelChange:   true,
      },
      orderBy: { recordTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hourlyRecord.count({ where }),
  ])

  return NextResponse.json({
    data: records,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(req: NextRequest) {
  try {
    const operatorCtx = await getOperatorContextFromApiRequest(req)
    if (!operatorCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const operatorId = operatorCtx.operatorId

    if (operatorCtx.source === 'nextauth') {
      const dbUser = await prisma.user.findUnique({
        where: { id: operatorId },
        select: { role: true, sectionId: true },
      })
      if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const canWrite = await checkPermission({
        userId: operatorId,
        role: dbUser.role,
        permissionKey: 'api.production.record.write',
        context: { apiPath: req.nextUrl.pathname, sectionId: dbUser.sectionId },
      })
      if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data

    const recordOperatorId = (data.recordOperatorId?.trim() || operatorId) as string
    if (!recordOperatorId) {
      return NextResponse.json({ error: 'ไม่พบผู้ลงชื่อ — เลือกผู้บันทึกหรือล็อกอินใหม่' }, { status: 401 })
    }
    const eligible = await isUserEligibleForPart(recordOperatorId, data.partId)
    if (!eligible) {
      return NextResponse.json(
        { error: 'ผู้ลงชื่อที่เลือกไม่ถูกกำหนดให้ขึ้นงานรุ่น (Part) นี้' },
        { status: 400 },
      )
    }

    // Validate hour slot is current or previous only
    const nowMs = Date.now()
    const shift = getCurrentShift(nowMs)
    const currentSlot = getCurrentHourSlot(shift)
    const allowedMin = Math.max(1, currentSlot - 1)
    if (data.hourSlot < allowedMin || data.hourSlot > currentSlot) {
      return NextResponse.json({
        error: `อนุญาตบันทึกได้เฉพาะชั่วโมงที่ ${allowedMin}–${currentSlot} เท่านั้น (ปัจจุบัน+ย้อนหลัง 1 ชม.)`,
      }, { status: 400 })
    }

    // Validate session exists
    const prodSession = await prisma.productionSession.findUnique({ where: { id: data.sessionId } })
    if (!prodSession) return NextResponse.json({ error: 'Session ไม่พบ กรุณาสร้าง Session ก่อน' }, { status: 404 })

    if (prodSession.status !== 'IN_PROGRESS') {
      return NextResponse.json(
        { error: 'Session นี้ปิดกะแล้วหรือไม่พร้อมบันทึก — กรุณาเปิด Session ใหม่ของกะปัจจุบัน' },
        { status: 409 },
      )
    }
    if (prodSession.shiftType !== shift) {
      return NextResponse.json(
        {
          error:
            shift === 'DAY'
              ? 'กำลังอยู่กะเช้า — ไม่สามารถบันทึกลง Session กะดึกได้'
              : 'กำลังอยู่กะดึก — ไม่สามารถบันทึกลง Session กะเช้าได้',
        },
        { status: 409 },
      )
    }

    const currentReportingDate = getThaiReportingDateUTC(nowMs)
    const sessionReportingDate = prodSession.reportingDate ?? prodSession.sessionDate
    if (formatUtcDateKey(sessionReportingDate) !== formatUtcDateKey(currentReportingDate)) {
      return NextResponse.json(
        { error: 'Session นี้ไม่ใช่รอบวันรายงานปัจจุบัน — กรุณาเริ่ม Session ใหม่ก่อนบันทึก' },
        { status: 409 },
      )
    }

    // ตรวจซ้ำ — หนึ่งชั่วโมงต่อ session (ไม่ว่าจะเป็น Part ใด)
    const existing = await prisma.hourlyRecord.findUnique({
      where: { sessionId_hourSlot: { sessionId: data.sessionId, hourSlot: data.hourSlot } },
      include: { part: { select: { partSamco: true, partName: true } } },
    })
    if (existing) {
      return NextResponse.json(
        {
          error: 'มีข้อมูลชั่วโมงนี้แล้ว',
          existingPartId: existing.partId,
          existingPartSamco: existing.part?.partSamco ?? null,
          existingPartName: existing.part?.partName ?? null,
        },
        { status: 409 },
      )
    }

    // ดึง Target ระดับ Line (ใช้ LinePartTarget แทน MachinePartTarget)
    const target = await prisma.linePartTarget.findFirst({
      where: { lineId: prodSession.lineId, partId: data.partId, isActive: true },
      orderBy: { effectiveDate: 'desc' },
    })
    if (!target) {
      return NextResponse.json(
        { error: 'ไม่มีเป้า LinePartTarget สำหรับ Part นี้ใน Line ของ Session — กรุณาตั้งค่าใน Master' },
        { status: 400 },
      )
    }

    let breakdownData: ReturnType<typeof normalizeBreakdownEntries> = []
    try {
      breakdownData = data.breakdown ? normalizeBreakdownEntries(data.breakdown) : []
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'ข้อมูล Breakdown ไม่ถูกต้อง' },
        { status: 400 },
      )
    }
    const ngData = data.ng?.filter(ng => ng.problemCategoryId && ng.ngQty > 0) ?? []
    const hasBreakdown = breakdownData.length > 0
    const hasNg        = ngData.length > 0

    const lineMachineIds = await prisma.machine.findMany({
      where: { lineId: prodSession.lineId },
      select: { id: true },
    })
    const lineMachineIdSet = new Set(lineMachineIds.map(m => m.id))

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

    // ✅ Server คำนวณ recordTime และ isOvertimeHour เอง -- ไม่รับจาก client
    const serverNow = new Date()
    const isOvertimeHour = data.hourSlot > (prodSession.normalHours ?? 8)

    const record = await prisma.hourlyRecord.create({
      data: {
        sessionId:      data.sessionId,
        hourSlot:       data.hourSlot,
        recordTime:     serverNow,
        partId:         data.partId,
        machineId:      data.machineId ?? null,
        operatorId:     recordOperatorId,
        targetQty:      target.piecesPerHour,
        okQty:          data.okQty,
        isOvertimeHour,
        hasBreakdown,
        hasNg,
        remark:         data.remark ?? null,
        breakdownLogs: hasBreakdown ? {
          create: breakdownData.map(bd => ({
            breakdownStart:    bd.breakdownStart,
            breakdownEnd:      bd.breakdownEnd,
            breakTimeMin:      bd.breakTimeMin,
            problemCategoryId: bd.problemCategoryId,
            problemDetail:     bd.problemDetail ?? null,
            actionTaken:       bd.actionTaken ?? null,
            machineId:         (bd as { machineId?: string | null }).machineId?.trim() ?? null,
          })),
        } : undefined,
        ngLogs: hasNg ? {
          create: ngData.map(ng => ({
            machineId:         ng.machineId?.trim() ?? null,
            ngQty:             ng.ngQty,
            problemCategoryId: ng.problemCategoryId,
            problemDetail:     ng.problemDetail ?? null,
            actionTaken:       ng.actionTaken ?? null,
          })),
        } : undefined,
      },
      include: { breakdownLogs: true, ngLogs: true },
    })

    const auditActorId = await auditUserIdFromDbUserId(operatorId)
    await prisma.auditLog.create({
      data: {
        userId: auditActorId,
        action: 'CREATE_RECORD',
        entity: 'hourly_records',
        entityId: record.id,
        details: { hourSlot: data.hourSlot, okQty: data.okQty },
      },
    })

    return NextResponse.json({ data: record }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/production/records error:', e)
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 })
  }
}
