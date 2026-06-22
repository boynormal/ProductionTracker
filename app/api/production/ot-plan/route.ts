import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { otPlanBatchSchema } from '@/lib/validations/production'
import type { Prisma } from '@prisma/client'

// ─── helpers ────────────────────────────────────────────────────────────────

function parseMonthRange(monthStr: string): { from: Date; toExclusive: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthStr.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return {
    from: new Date(Date.UTC(y, mo - 1, 1)),
    toExclusive: new Date(Date.UTC(y, mo, 1)),
  }
}

function parseYearRange(yearStr: string): { from: Date; toExclusive: Date } | null {
  const y = Number(yearStr)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null
  return {
    from: new Date(Date.UTC(y, 0, 1)),
    toExclusive: new Date(Date.UTC(y + 1, 0, 1)),
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function resolveLineWhere(
  lineId?: string,
  divisionId?: string,
): Promise<Prisma.LineWhereInput> {
  if (lineId) return { id: lineId, isActive: true }
  if (divisionId) {
    const sections = await prisma.section.findMany({
      where: { isActive: true, divisionId },
      select: { id: true },
    })
    if (sections.length === 0) return { id: 'no-match' }
    return { sectionId: { in: sections.map((s) => s.id) }, isActive: true }
  }
  return { isActive: true }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canRead = await checkPermissionForSession(session, 'api.production.otplan.read', {
    apiPath: req.nextUrl.pathname,
  })
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') === 'year' ? 'year' : 'month'
  const lineIdParam = searchParams.get('lineId')?.trim() || undefined
  const divisionIdParam = searchParams.get('divisionId')?.trim() || undefined

  // ─── Date range ────────────────────────────────────────────────────────────
  let from: Date
  let toExclusive: Date

  if (mode === 'year') {
    const yearParam = searchParams.get('year') ?? String(new Date().getUTCFullYear())
    const range = parseYearRange(yearParam)
    if (!range) return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 })
    from = range.from
    toExclusive = range.toExclusive
  } else {
    const now = new Date()
    const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const monthParam = searchParams.get('month') ?? defaultMonth
    const range = parseMonthRange(monthParam)
    if (!range) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    from = range.from
    toExclusive = range.toExclusive
  }

  // ─── Lines ─────────────────────────────────────────────────────────────────
  const lineWhere = await resolveLineWhere(lineIdParam, divisionIdParam)
  const lines = await prisma.line.findMany({
    where: lineWhere,
    select: { id: true, lineCode: true, lineName: true },
    orderBy: { lineCode: 'asc' },
  })
  const lineIds = lines.map((l) => l.id)

  if (lineIds.length === 0) {
    return NextResponse.json({ data: [], mode, from: isoDate(from), to: isoDate(new Date(toExclusive.getTime() - 86400_000)) })
  }

  // ─── Fetch plan + actual + holidays in parallel ────────────────────────────
  // Actual OT hours counted per hourly_record:
  //   - Weekday session → count only records with isOvertimeHour=true  (structural OT, slots 9–11)
  //   - Sunday or public holiday session → count ALL records  (every slot is OT)
  const [plans, otRecords, holidayRows] = await Promise.all([
    prisma.otPlan.findMany({
      where: {
        lineId: { in: lineIds },
        planDate: { gte: from, lt: toExclusive },
      },
      select: { lineId: true, planDate: true, plannedHours: true, remark: true },
    }),
    // Fetch all hourly records for sessions in range — filter by isOvertimeHour in JS
    // so we can apply the Sunday/holiday rule after checking the date.
    prisma.hourlyRecord.findMany({
      where: {
        session: {
          lineId: { in: lineIds },
          reportingDate: { gte: from, lt: toExclusive },
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        },
      },
      select: {
        isOvertimeHour: true,
        session: { select: { lineId: true, reportingDate: true } },
      },
    }),
    prisma.holiday.findMany({
      where: {
        date: { gte: from, lt: toExclusive },
        isActive: true,
      },
      select: { date: true },
    }),
  ])

  // ─── Aggregate ─────────────────────────────────────────────────────────────
  // plan map: "lineId|YYYY-MM-DD" -> plannedHours
  const planMap = new Map<string, number>()
  const planRemarkMap = new Map<string, string | null>()
  for (const p of plans) {
    const key = `${p.lineId}|${isoDate(p.planDate)}`
    planMap.set(key, p.plannedHours)
    planRemarkMap.set(key, p.remark ?? null)
  }

  // holiday set: Set of "YYYY-MM-DD" strings for quick lookup
  const holidaySet = new Set(holidayRows.map((h) => isoDate(h.date)))

  // actual map: "lineId|YYYY-MM-DD" -> OT hours (each matching record = 1 hr)
  const actualMap = new Map<string, number>()
  for (const rec of otRecords) {
    const rd = rec.session?.reportingDate
    const lineId = rec.session?.lineId
    if (!rd || !lineId) continue
    const dateStr = isoDate(rd)
    const isSundayOrHoliday = rd.getUTCDay() === 0 || holidaySet.has(dateStr)
    // On weekdays count only structural OT slots; on Sunday/holidays count everything
    if (!isSundayOrHoliday && !rec.isOvertimeHour) continue
    const key = `${lineId}|${dateStr}`
    actualMap.set(key, (actualMap.get(key) ?? 0) + 1)
  }

  if (mode === 'month') {
    // Build per-day columns for the month
    const days: string[] = []
    const cur = new Date(from)
    while (cur < toExclusive) {
      days.push(isoDate(cur))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

    const data = lines.map((line) => {
      let totalPlan = 0
      let totalActual = 0
      const dayData: Record<string, { plan: number; actual: number; remark: string | null }> = {}

      for (const day of days) {
        const key = `${line.id}|${day}`
        const plan = planMap.get(key) ?? 0
        const actual = actualMap.get(key) ?? 0
        totalPlan += plan
        totalActual += actual
        dayData[day] = { plan, actual, remark: planRemarkMap.get(key) ?? null }
      }

      const diff =
        totalPlan > 0 ? Math.round(((totalActual - totalPlan) / totalPlan) * 1000) / 10 : null

      return {
        lineId: line.id,
        lineCode: line.lineCode,
        lineName: line.lineName,
        days: dayData,
        totals: { plan: totalPlan, actual: totalActual, diff },
      }
    })

    return NextResponse.json({ data, mode, days, from: isoDate(from), to: isoDate(new Date(toExclusive.getTime() - 86400_000)) })
  }

  // mode === 'year': aggregate by month
  const data = lines.map((line) => {
    const months: Record<string, { plan: number; actual: number; diff: number | null }> = {}
    let totalPlan = 0
    let totalActual = 0

    for (let mo = 0; mo < 12; mo++) {
      const moFrom = new Date(Date.UTC(from.getUTCFullYear(), mo, 1))
      const moTo = new Date(Date.UTC(from.getUTCFullYear(), mo + 1, 1))
      const moKey = isoDate(moFrom).slice(0, 7) // YYYY-MM

      let moPlan = 0
      let moActual = 0

      // sum days in this month
      const cur = new Date(moFrom)
      while (cur < moTo) {
        const dayKey = `${line.id}|${isoDate(cur)}`
        moPlan += planMap.get(dayKey) ?? 0
        moActual += actualMap.get(dayKey) ?? 0
        cur.setUTCDate(cur.getUTCDate() + 1)
      }

      totalPlan += moPlan
      totalActual += moActual
      months[moKey] = {
        plan: moPlan,
        actual: moActual,
        diff: moPlan > 0 ? Math.round(((moActual - moPlan) / moPlan) * 1000) / 10 : null,
      }
    }

    return {
      lineId: line.id,
      lineCode: line.lineCode,
      lineName: line.lineName,
      months,
      totals: {
        plan: totalPlan,
        actual: totalActual,
        diff: totalPlan > 0 ? Math.round(((totalActual - totalPlan) / totalPlan) * 1000) / 10 : null,
      },
    }
  })

  return NextResponse.json({ data, mode, year: String(from.getUTCFullYear()) })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canWrite = await checkPermissionForSession(session, 'api.production.otplan.write', {
    apiPath: req.nextUrl.pathname,
  })
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const raw = await req.json()
    const parsed = otPlanBatchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const results = await Promise.all(
      parsed.data.items.map((item) =>
        prisma.otPlan.upsert({
          where: {
            lineId_planDate: {
              lineId: item.lineId,
              planDate: new Date(item.planDate),
            },
          },
          update: {
            plannedHours: item.plannedHours,
            remark: item.remark ?? null,
          },
          create: {
            lineId: item.lineId,
            planDate: new Date(item.planDate),
            plannedHours: item.plannedHours,
            remark: item.remark ?? null,
          },
        }),
      ),
    )

    return NextResponse.json({ data: results, count: results.length }, { status: 200 })
  } catch (error) {
    console.error('POST /api/production/ot-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
