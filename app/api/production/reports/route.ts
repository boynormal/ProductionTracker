import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseThaiCalendarDateUtc, dayEndExclusiveUTC } from '@/lib/time-utils'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'
import { MAX_PRODUCTION_REPORT_RANGE_DAYS } from '@/lib/constants/production-reports'
import { calcAvailability, calcPerformance, calcQuality, calcOEE } from '@/lib/utils/oee'

/** รวม Session ที่ยังเปิดกะ — ไม่เช่นนั้นรายงานจะว่างจนกว่าจะปิดกะ */
const REPORT_SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const

type Granularity = 'day' | 'month'
const WITH_LEGACY_SESSION_DATE_FALLBACK = false

function periodKey(reportingDate: Date, g: Granularity): string {
  const ymd = reportingDate.toISOString().slice(0, 10)
  return g === 'month' ? ymd.slice(0, 7) : ymd
}

/** ขอบเขตเดือนตามปฏิทิน UTC (สอดคล้องกับ sessionDate ใน DB) */
function utcMonthRangeFromDate(fromDate: Date): { start: Date; endExclusive: Date; daysInMonth: number; y: number; m: number } {
  const y = fromDate.getUTCFullYear()
  const m = fromDate.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1))
  const endExclusive = new Date(Date.UTC(y, m + 1, 1))
  const daysInMonth = Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000)
  return { start, endExclusive, daysInMonth, y, m }
}


export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const sectionId = searchParams.get('sectionId') || undefined
  const divisionId = searchParams.get('divisionId') || undefined
  const departmentId = searchParams.get('departmentId') || undefined
  const granRaw = searchParams.get('granularity') ?? 'day'
  const granularity: Granularity = granRaw === 'month' ? 'month' : 'day'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const fromDate = parseThaiCalendarDateUtc(from)
  const toDate = parseThaiCalendarDateUtc(to)
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 })
  }

  const toExclusive = dayEndExclusiveUTC(toDate)
  if (fromDate >= toExclusive) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  const rangeMs = toExclusive.getTime() - fromDate.getTime()
  if (rangeMs > MAX_PRODUCTION_REPORT_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: `ช่วงวันที่ยาวเกิน ${MAX_PRODUCTION_REPORT_RANGE_DAYS} วัน (สูงสุด 1 ปีต่อคำขอ)` },
      { status: 400 },
    )
  }

  // Resolve org hierarchy filter → most specific wins: section > division > department
  let lineWhere: Record<string, unknown> = {}
  if (sectionId) {
    lineWhere = { line: { sectionId } }
  } else if (divisionId) {
    const divSections = await prisma.section.findMany({
      where: { divisionId, isActive: true },
      select: { id: true },
    })
    lineWhere = { line: { sectionId: { in: divSections.map((s) => s.id) } } }
  } else if (departmentId) {
    const deptDivisions = await prisma.division.findMany({
      where: { departmentId, isActive: true },
      select: { id: true },
    })
    const deptSections = await prisma.section.findMany({
      where: { divisionId: { in: deptDivisions.map((d) => d.id) }, isActive: true },
      select: { id: true },
    })
    lineWhere = { line: { sectionId: { in: deptSections.map((s) => s.id) } } }
  }

  const records = await prisma.hourlyRecord.findMany({
    where: {
      session: {
        status: { in: [...REPORT_SESSION_STATUSES] },
        ...reportingDateRangeWhere(fromDate, toExclusive, WITH_LEGACY_SESSION_DATE_FALLBACK),
        ...lineWhere,
      },
    },
    select: {
      okQty: true,
      targetQty: true,
      operatorId: true,
      partId: true,
      machineId: true,
      session: {
        select: {
          reportingDate: true,
          sessionDate: true,
          lineId: true,
          line: { select: { lineCode: true } },
        },
      },
      operator: {
        select: { employeeCode: true, firstName: true, lastName: true },
      },
      part: { select: { partSamco: true, partName: true } },
      machine: { select: { mcNo: true, line: { select: { lineCode: true } } } },
      breakdownLogs: {
        select: {
          breakTimeMin: true,
          problemCategoryId: true,
          problemCategory: { select: { code: true, name: true } },
        },
      },
      ngLogs: {
        select: {
          ngQty: true,
          problemCategoryId: true,
          problemCategory: { select: { code: true, name: true } },
        },
      },
    },
  })

  type OpRow = {
    operatorId: string
    employeeCode: string
    name: string
    partId: string
    partSamco: number
    partName: string
    period: string
    okQty: number
  }

  type PartRow = {
    partId: string
    partSamco: number
    partName: string
    period: string
    okQty: number
  }

  type McAgg = {
    machineId: string
    mcNo: string
    lineCode: string
    period: string
    okQty: number
    targetQty: number
    ngQty: number
    bdMin: number
    slotCount: number
  }
  type LineAgg = {
    lineId: string
    lineCode: string
    period: string
    okQty: number
    targetQty: number
    ngQty: number
    bdMin: number
    slotCount: number
  }

  type CatBdAgg = { categoryId: string; code: string; name: string; count: number; bdMin: number }
  type CatNgAgg = { categoryId: string; code: string; name: string; ngQty: number }

  type BdLineAgg = {
    lineId: string
    lineCode: string
    period: string
    bdCount: number
    bdMin: number
    categories: Map<string, CatBdAgg>
  }
  type NgLineAgg = {
    lineId: string
    lineCode: string
    period: string
    ngQty: number
    okQty: number
    categories: Map<string, CatNgAgg>
  }

  const opMap = new Map<string, OpRow>()
  const partMap = new Map<string, PartRow>()
  const mcMap = new Map<string, McAgg>()
  const lineMap = new Map<string, LineAgg>()
  const bdLineMap = new Map<string, BdLineAgg>()
  const ngLineMap = new Map<string, NgLineAgg>()

  for (const r of records) {
    if (!r.session.reportingDate) continue
    const period = periodKey(r.session.reportingDate, granularity)
    const opKey = `${r.operatorId}|${r.partId}|${period}`
    const pKey = `${r.partId}|${period}`

    const opName = `${r.operator.firstName} ${r.operator.lastName}`.trim()

    if (!opMap.has(opKey)) {
      opMap.set(opKey, {
        operatorId: r.operatorId,
        employeeCode: r.operator.employeeCode,
        name: opName,
        partId: r.partId,
        partSamco: r.part.partSamco,
        partName: r.part.partName,
        period,
        okQty: 0,
      })
    }
    opMap.get(opKey)!.okQty += r.okQty

    if (!partMap.has(pKey)) {
      partMap.set(pKey, {
        partId: r.partId,
        partSamco: r.part.partSamco,
        partName: r.part.partName,
        period,
        okQty: 0,
      })
    }
    partMap.get(pKey)!.okQty += r.okQty

    let bd = 0
    for (const b of r.breakdownLogs) bd += b.breakTimeMin
    let ng = 0
    for (const n of r.ngLogs) ng += n.ngQty

    const lk = `${r.session.lineId}|${period}`
    if (!lineMap.has(lk)) {
      lineMap.set(lk, {
        lineId: r.session.lineId,
        lineCode: r.session.line.lineCode,
        period,
        okQty: 0,
        targetQty: 0,
        ngQty: 0,
        bdMin: 0,
        slotCount: 0,
      })
    }
    const l = lineMap.get(lk)!
    l.okQty += r.okQty
    l.targetQty += r.targetQty
    l.ngQty += ng
    l.bdMin += bd
    l.slotCount += 1

    // Breakdown detail aggregation (per line × period × category)
    if (r.breakdownLogs.length > 0) {
      if (!bdLineMap.has(lk)) {
        bdLineMap.set(lk, {
          lineId: r.session.lineId,
          lineCode: r.session.line.lineCode,
          period,
          bdCount: 0,
          bdMin: 0,
          categories: new Map(),
        })
      }
      const bdEntry = bdLineMap.get(lk)!
      for (const b of r.breakdownLogs) {
        bdEntry.bdCount += 1
        bdEntry.bdMin += b.breakTimeMin
        const catId = b.problemCategoryId
        if (!bdEntry.categories.has(catId)) {
          bdEntry.categories.set(catId, {
            categoryId: catId,
            code: b.problemCategory.code,
            name: b.problemCategory.name,
            count: 0,
            bdMin: 0,
          })
        }
        const cat = bdEntry.categories.get(catId)!
        cat.count += 1
        cat.bdMin += b.breakTimeMin
      }
    }

    // NG detail aggregation (per line × period × category)
    if (r.ngLogs.length > 0) {
      if (!ngLineMap.has(lk)) {
        ngLineMap.set(lk, {
          lineId: r.session.lineId,
          lineCode: r.session.line.lineCode,
          period,
          ngQty: 0,
          okQty: 0,
          categories: new Map(),
        })
      }
      const ngEntry = ngLineMap.get(lk)!
      for (const n of r.ngLogs) {
        ngEntry.ngQty += n.ngQty
        const catId = n.problemCategoryId
        if (!ngEntry.categories.has(catId)) {
          ngEntry.categories.set(catId, {
            categoryId: catId,
            code: n.problemCategory.code,
            name: n.problemCategory.name,
            ngQty: 0,
          })
        }
        ngEntry.categories.get(catId)!.ngQty += n.ngQty
      }
    }

    if (!(r.machineId && r.machine)) {
      continue
    }

    const machineKey = r.machineId && r.machine ? r.machineId : `UNASSIGNED:${r.session.lineId}`
    const machineName = r.machineId && r.machine ? r.machine.mcNo : 'UNASSIGNED'
    const lineCode = r.machineId && r.machine ? r.machine.line.lineCode : r.session.line.lineCode
    const mk = `${machineKey}|${period}`

    if (!mcMap.has(mk)) {
      mcMap.set(mk, {
        machineId: machineKey,
        mcNo: machineName,
        lineCode,
        period,
        okQty: 0,
        targetQty: 0,
        ngQty: 0,
        bdMin: 0,
        slotCount: 0,
      })
    }
    const m = mcMap.get(mk)!
    m.okQty += r.okQty
    m.targetQty += r.targetQty
    m.ngQty += ng
    m.bdMin += bd
    m.slotCount += 1
  }

  const byOperator = Array.from(opMap.values()).sort((a, b) => {
    const c = a.name.localeCompare(b.name, 'th', { sensitivity: 'base' })
    if (c !== 0) return c
    const p = a.partSamco - b.partSamco
    if (p !== 0) return p
    return a.period.localeCompare(b.period)
  })

  const byPart = Array.from(partMap.values()).sort((a, b) => {
    const p = a.partSamco - b.partSamco
    if (p !== 0) return p
    return a.period.localeCompare(b.period)
  })

  const byMachine = Array.from(mcMap.values())
    .map((m) => {
      const plannedMin = m.slotCount * 60
      const availability = calcAvailability(plannedMin, m.bdMin)
      const performance = calcPerformance(m.okQty + m.ngQty, m.targetQty)
      const quality = calcQuality(m.okQty, m.ngQty)
      const oee = calcOEE(availability, performance, quality)
      return {
        machineId: m.machineId,
        mcNo: m.mcNo,
        lineCode: m.lineCode,
        period: m.period,
        okQty: m.okQty,
        targetQty: m.targetQty,
        ngQty: m.ngQty,
        bdMin: m.bdMin,
        availability,
        performance,
        quality,
        oee,
      }
    })
    .sort((a, b) => {
      const c = a.mcNo.localeCompare(b.mcNo, 'th', { numeric: true, sensitivity: 'base' })
      if (c !== 0) return c
      return a.period.localeCompare(b.period)
    })

  const byLine = Array.from(lineMap.values())
    .map((l) => {
      const plannedMin = l.slotCount * 60
      const availability = calcAvailability(plannedMin, l.bdMin)
      const performance = calcPerformance(l.okQty + l.ngQty, l.targetQty)
      const quality = calcQuality(l.okQty, l.ngQty)
      const oee = calcOEE(availability, performance, quality)
      return {
        lineId: l.lineId,
        lineCode: l.lineCode,
        period: l.period,
        okQty: l.okQty,
        targetQty: l.targetQty,
        ngQty: l.ngQty,
        bdMin: l.bdMin,
        availability,
        performance,
        quality,
        oee,
      }
    })
    .sort((a, b) => {
      const c = a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true, sensitivity: 'base' })
      if (c !== 0) return c
      return a.period.localeCompare(b.period)
    })

  let operatorMonthMatrix: {
    year: number
    month: number
    monthKey: string
    daysInMonth: number
    rows: {
      operatorId: string
      employeeCode: string
      name: string
      /** index = วันที่ - 1 (วันที่ 1 → [0]) */
      cells: { parts: { partSamco: number; partName: string; okQty: number }[] }[]
    }[]
  } | null = null

  if (granularity === 'month') {
    const { start: mStart, endExclusive: mEnd, daysInMonth, y, m } = utcMonthRangeFromDate(fromDate)
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`

    type PartAgg = { partSamco: number; partName: string; okQty: number }
    const grid = new Map<string, Map<number, Map<string, PartAgg>>>()

    for (const r of records) {
      const sd = r.session.reportingDate
      if (!sd) continue
      if (sd < mStart || sd >= mEnd) continue

      const day = sd.getUTCDate()
      if (day < 1 || day > daysInMonth) continue

      const oid = r.operatorId
      if (!grid.has(oid)) grid.set(oid, new Map())
      const opDays = grid.get(oid)!
      if (!opDays.has(day)) opDays.set(day, new Map())
      const dayParts = opDays.get(day)!
      const pid = r.partId
      const existing = dayParts.get(pid)
      if (existing) {
        existing.okQty += r.okQty
      } else {
        dayParts.set(pid, {
          partSamco: r.part.partSamco,
          partName: r.part.partName,
          okQty: r.okQty,
        })
      }
    }

    const meta = new Map<string, { employeeCode: string; name: string }>()
    for (const r of records) {
      const sd = r.session.reportingDate
      if (!sd) continue
      if (sd < mStart || sd >= mEnd) continue
      if (!meta.has(r.operatorId)) {
        meta.set(r.operatorId, {
          employeeCode: r.operator.employeeCode,
          name: `${r.operator.firstName} ${r.operator.lastName}`.trim(),
        })
      }
    }

    const rowKeys = Array.from(grid.keys()).sort((a, b) => {
      const ca = meta.get(a)?.employeeCode ?? ''
      const cb = meta.get(b)?.employeeCode ?? ''
      const c = ca.localeCompare(cb, 'th', { numeric: true, sensitivity: 'base' })
      if (c !== 0) return c
      return (meta.get(a)?.name ?? '').localeCompare(meta.get(b)?.name ?? '', 'th', { sensitivity: 'base' })
    })

    operatorMonthMatrix = {
      year: y,
      month: m + 1,
      monthKey,
      daysInMonth,
      rows: rowKeys.map((operatorId) => {
        const opDays = grid.get(operatorId)!
        const mRow = meta.get(operatorId)!
        const cells: { parts: { partSamco: number; partName: string; okQty: number }[] }[] = []
        for (let d = 1; d <= daysInMonth; d++) {
          const pmap = opDays.get(d)
          const parts = pmap ? Array.from(pmap.values()) : []
          parts.sort((a, b) => a.partSamco - b.partSamco)
          cells.push({ parts })
        }
        return {
          operatorId,
          employeeCode: mRow.employeeCode,
          name: mRow.name,
          cells,
        }
      }),
    }
  }

  const byLineBreakdown = Array.from(bdLineMap.values())
    .map((e) => {
      const cats = Array.from(e.categories.values()).sort((a, b) => b.bdMin - a.bdMin)
      return {
        lineId: e.lineId,
        lineCode: e.lineCode,
        period: e.period,
        bdCount: e.bdCount,
        bdMin: e.bdMin,
        topCategory: cats[0] ?? null,
        categories: cats,
      }
    })
    .sort((a, b) => {
      const c = a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true, sensitivity: 'base' })
      if (c !== 0) return c
      return a.period.localeCompare(b.period)
    })

  const byLineNg = Array.from(ngLineMap.values())
    .map((e) => {
      const cats = Array.from(e.categories.values()).sort((a, b) => b.ngQty - a.ngQty)
      const okQty = lineMap.get(`${e.lineId}|${e.period}`)?.okQty ?? e.okQty
      const total = okQty + e.ngQty
      return {
        lineId: e.lineId,
        lineCode: e.lineCode,
        period: e.period,
        ngQty: e.ngQty,
        okQty,
        ngRate: total > 0 ? e.ngQty / total : 0,
        topCategory: cats[0] ?? null,
        categories: cats,
      }
    })
    .sort((a, b) => {
      const c = a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true, sensitivity: 'base' })
      if (c !== 0) return c
      return a.period.localeCompare(b.period)
    })

  return NextResponse.json({
    granularity,
    byOperator,
    byPart,
    byMachine,
    byLine,
    byLineBreakdown,
    byLineNg,
    operatorMonthMatrix,
  })
}
