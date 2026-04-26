import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { getCurrentShift } from '@/lib/utils/shift'
import { getThaiTodayUTC, getThaiReportingDateUTC, parseThaiPickerDateToUTC, dayEndExclusiveUTC } from '@/lib/utils/thai-time'
import { checkPermission } from '@/lib/permissions/guard'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'

const WITH_LEGACY_SESSION_DATE_FALLBACK = false
const DEFAULT_OVERRIDE_ROLES: UserRole[] = ['SUPERVISOR', 'ENGINEER']

type GuardMode = 'warn' | 'enforce'

function getLineTargetGuardMode(): GuardMode {
  const raw = (process.env.LINE_TARGET_GUARD_MODE ?? 'warn').trim().toLowerCase()
  return raw === 'enforce' ? 'enforce' : 'warn'
}

function getLineTargetOverrideRoles(): Set<UserRole> {
  const raw = (process.env.LINE_TARGET_GUARD_OVERRIDE_ROLES ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
  if (raw.length === 0) return new Set(DEFAULT_OVERRIDE_ROLES)
  const out = new Set<UserRole>()
  for (const role of raw) {
    if (role === 'OPERATOR' || role === 'SUPERVISOR' || role === 'ENGINEER' || role === 'MANAGER' || role === 'ADMIN') {
      out.add(role)
    }
  }
  return out.size > 0 ? out : new Set(DEFAULT_OVERRIDE_ROLES)
}

function isOverrideAllowedInMode(mode: GuardMode): boolean {
  const raw = (process.env.LINE_TARGET_GUARD_ALLOW_OVERRIDE ?? '').trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return mode === 'warn'
}

function parseBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  if (ctx.source === 'scan' && !searchParams.get('machineId') && !searchParams.get('lineId')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const machineId = searchParams.get('machineId')
  const date      = searchParams.get('date')
  const status    = searchParams.get('status')
  const lineId    = searchParams.get('lineId')
  const detailed  = searchParams.get('detailed') === '1'
  /** Optional: align list with record page / unique key (sessionDate + shiftType + lineId) */
  const sessionDateStr = searchParams.get('sessionDate')
  const shiftTypeRaw   = searchParams.get('shiftType')

  const where: any = {}
  if (machineId) where.machineId = machineId
  if (status) where.status = status
  if (lineId) where.lineId = lineId
  if (date) {
    const dayStart = parseThaiPickerDateToUTC(date)
    if (!dayStart) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    Object.assign(where, reportingDateRangeWhere(dayStart, dayEndExclusiveUTC(dayStart), WITH_LEGACY_SESSION_DATE_FALLBACK))
  }
  if (sessionDateStr) {
    const sd = parseThaiPickerDateToUTC(sessionDateStr)
    if (!sd) return NextResponse.json({ error: 'sessionDate must be YYYY-MM-DD' }, { status: 400 })
    where.sessionDate = sd
  }
  if (shiftTypeRaw) {
    const st = shiftTypeRaw.trim().toUpperCase()
    if (st !== 'DAY' && st !== 'NIGHT') {
      return NextResponse.json({ error: 'shiftType must be DAY or NIGHT' }, { status: 400 })
    }
    where.shiftType = st
  }

  const include = detailed
    ? {
        machine:  true,
        line:     {
          include: {
            section: {
              include: {
                division: {
                  include: { department: true },
                },
              },
            },
          },
        },
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        hourlyRecords: {
          include: {
            breakdownLogs: true,
            ngLogs: true,
            part: { include: { customer: true } },
            operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
          },
          orderBy: { hourSlot: 'asc' as const },
        },
      }
    : {
        machine:  true,
        line:     {
          include: {
            section: {
              include: {
                division: {
                  include: { department: true },
                },
              },
            },
          },
        },
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        _count:   { select: { hourlyRecords: true } },
      }

  const sessions = await prisma.productionSession.findMany({
    where,
    include,
    orderBy: [{ reportingDate: 'desc' }, { sessionDate: 'desc' }, { shiftType: 'asc' }],
    take: detailed ? 500 : 50,
  })

  return NextResponse.json({ data: sessions })
}

export async function POST(req: NextRequest) {
  try {
    const operatorCtx = await getOperatorContextFromApiRequest(req)
    if (!operatorCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const operatorId = operatorCtx.operatorId
    const mode = getLineTargetGuardMode()
    const allowOverrideInMode = isOverrideAllowedInMode(mode)
    const allowedOverrideRoles = getLineTargetOverrideRoles()
    const dbUser = await prisma.user.findUnique({
      where: { id: operatorId },
      select: { role: true, sectionId: true },
    })
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (operatorCtx.source === 'nextauth') {
      const canWrite = await checkPermission({
        userId: operatorId,
        role: dbUser.role,
        permissionKey: 'api.production.session.write',
        context: { apiPath: req.nextUrl.pathname, sectionId: dbUser.sectionId },
      })
      if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()

    if (!body.lineId) {
      return NextResponse.json({ error: 'lineId required' }, { status: 400 })
    }

    const line = await prisma.line.findUnique({
      where: { id: body.lineId },
      select: { id: true, lineCode: true, lineName: true, isActive: true },
    })
    if (!line) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }
    if (!line.isActive) {
      return NextResponse.json(
        {
          error: 'Line นี้ถูกปิดใช้งาน — กรุณาเปิดใช้งานใน Master ก่อน',
          code: 'LINE_INACTIVE',
        },
        { status: 400 },
      )
    }

    const activeTargetCount = await prisma.linePartTarget.count({
      where: { lineId: body.lineId, isActive: true },
    })
    const hasActiveLineTarget = activeTargetCount > 0
    const wantsOverride = parseBool(body.allowNoTargetOverride)
    const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : ''
    const canRoleOverride = allowedOverrideRoles.has(dbUser.role)
    const canOverrideMissingTarget = allowOverrideInMode && canRoleOverride
    const overrideApplied = !hasActiveLineTarget && wantsOverride && canOverrideMissingTarget && overrideReason.length > 0

    if (!hasActiveLineTarget) {
      await prisma.auditLog.create({
        data: {
          userId: operatorId,
          action: overrideApplied ? 'SESSION_GUARD_OVERRIDE' : 'SESSION_GUARD_WARN',
          entity: 'production_sessions',
          details: {
            lineId: body.lineId,
            lineCode: line.lineCode,
            lineName: line.lineName,
            activeLineTargetCount: activeTargetCount,
            mode,
            source: operatorCtx.source,
            overrideRequested: wantsOverride,
            overrideApplied,
            overrideReason: overrideReason || null,
          },
        },
      })
    }

    if (!hasActiveLineTarget && mode === 'enforce' && !overrideApplied) {
      const roleText = [...allowedOverrideRoles].join(', ')
      const missingReasonText = wantsOverride && overrideReason.length === 0
      return NextResponse.json(
        {
          error: missingReasonText
            ? 'ต้องระบุเหตุผลก่อนใช้สิทธิ์เปิด Session ชั่วคราว'
            : canOverrideMissingTarget
              ? 'ไม่มี LinePartTarget สำหรับสายนี้ — ไปตั้งค่าใน Master หรือใช้สิทธิ์เปิด Session ชั่วคราวพร้อมเหตุผล'
              : `ไม่มี LinePartTarget สำหรับสายนี้ — กรุณาตั้งค่าใน Master (สิทธิ์ override: ${roleText})`,
          code: 'LINE_TARGET_MISSING',
          guard: {
            mode,
            lineId: body.lineId,
            lineCode: line.lineCode,
            lineName: line.lineName,
            activeLineTargetCount: activeTargetCount,
            canOverrideMissingTarget,
            overrideRequested: wantsOverride,
            overrideReasonRequired: wantsOverride && overrideReason.length === 0,
          },
        },
        { status: 409 },
      )
    }

    // ✅ ใช้เวลา server เป็นแหล่งเดียว แล้วแปลงเป็นปฏิทินไทยอย่าง deterministic
    const startTime = new Date()
    const nowMs = startTime.getTime()
    const sessionDate = getThaiTodayUTC(nowMs)
    const reportingDate = getThaiReportingDateUTC(nowMs)
    const shiftType   = getCurrentShift()

    /** ห้ามเปิดสองกะพร้อมในวันเดียวกัน (sessionDate เดียวกัน) — กันข้อมูล hourly ปนกันระหว่างกริดกะ */
    if (shiftType === 'NIGHT') {
      const dayOpen = await prisma.productionSession.findFirst({
        where: {
          lineId: body.lineId,
          sessionDate,
          shiftType: 'DAY',
          status: 'IN_PROGRESS',
        },
        select: { id: true },
      })
      if (dayOpen) {
        return NextResponse.json(
          {
            error:
              'ยังมี Session กะเช้าเปิดอยู่ (IN_PROGRESS) — กรุณาปิดกะเช้าในระบบก่อนเปิดหรือบันทึกกะดึก',
            code: 'DAY_SESSION_STILL_OPEN',
          },
          { status: 409 },
        )
      }
    }
    if (shiftType === 'DAY') {
      const nightOpen = await prisma.productionSession.findFirst({
        where: {
          lineId: body.lineId,
          sessionDate,
          shiftType: 'NIGHT',
          status: 'IN_PROGRESS',
        },
        select: { id: true },
      })
      if (nightOpen) {
        return NextResponse.json(
          {
            error:
              'ยังมี Session กะดึกเปิดอยู่ (IN_PROGRESS) — กรุณาปิดกะดึกในระบบก่อนเปิดกะเช้า',
            code: 'NIGHT_SESSION_STILL_OPEN',
          },
          { status: 409 },
        )
      }
    }

    // Session unique: 1 Line ต่อ 1 กะ ต่อ 1 วัน
    const existing = await prisma.productionSession.findUnique({
      where: {
        sessionDate_shiftType_lineId: {
          sessionDate,
          shiftType,
          lineId: body.lineId,
        },
      },
    })
    if (existing) return NextResponse.json({ error: 'Session ของ Line นี้เปิดอยู่แล้ว', data: existing }, { status: 409 })

    const totalHours = (body.normalHours ?? 8) + (body.otHours ?? 0)

    const created = await prisma.productionSession.create({
      data: {
        sessionDate,
        reportingDate,
        shiftType,
        lineId:      body.lineId,
        machineId:   body.machineId ?? null,
        operatorId,
        startTime,
        normalHours: body.normalHours ?? 8,
        otHours:     body.otHours ?? 0,
        totalHours,
      },
    })

    const warning = !hasActiveLineTarget
      ? {
          code: 'LINE_TARGET_MISSING',
          message: overrideApplied
            ? 'เปิด Session ชั่วคราวแล้ว แม้ยังไม่มี LinePartTarget — กรุณาตั้งค่าใน Master โดยเร็ว'
            : 'สายนี้ยังไม่มี LinePartTarget — เปิด Session ได้ชั่วคราว และควรตั้งค่าใน Master',
          mode,
          lineId: line.id,
          lineCode: line.lineCode,
          lineName: line.lineName,
          activeLineTargetCount: activeTargetCount,
          overrideApplied,
          overrideReason: overrideApplied ? overrideReason : null,
        }
      : null

    return NextResponse.json({ data: created, ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/production/sessions error:', e)
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 })
  }
}
