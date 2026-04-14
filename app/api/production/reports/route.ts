import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseThaiCalendarDateUtc, dayEndExclusiveUTC } from '@/lib/time-utils'
import { calcAvailability, calcPerformance, calcQuality, calcOEE } from '@/lib/utils/oee'

/** ช่วงสูงสุดต่อคำขอ — รองรับการดูย้อนหลังหลายปี (ระวังช้าถ้าข้อมูลมาก) */
const MAX_RANGE_DAYS = 3650

/** รวม Session ที่ยังเปิดกะ — ไม่เช่นนั้นรายงานจะว่างจนกว่าจะปิดกะ */
const REPORT_SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const

type Granularity = 'day' | 'month'

function periodKey(sessionDate: Date, g: Granularity): string {
  const ymd = sessionDate.toISOString().slice(0, 10)
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
  if (rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: `ช่วงวันที่ยาวเกิน ${MAX_RANGE_DAYS} วัน` },
      { status: 400 },
    )
  }

  const records = await prisma.hourlyRecord.findMany({
    where: {
      session: {
        status: { in: [...REPORT_SESSION_STATUSES] },
        sessionDate: { gte: fromDate, lt: toExclusive },
        ...(sectionId ? { line: { sectionId } } : {}),
      },
    },
    select: {
      okQty: true,
      targetQty: true,
      operatorId: true,
      partId: true,
      machineId: true,
      session: { select: { sessionDate: true } },
      operator: {
        select: { employeeCode: true, firstName: true, lastName: true },
      },
      part: { select: { partSamco: true, partName: true } },
      machine: { select: { mcNo: true, line: { select: { lineCode: true } } } },
      breakdownLogs: { select: { breakTimeMin: true } },
      ngLogs: { select: { ngQty: true } },
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

  const opMap = new Map<string, OpRow>()
  const partMap = new Map<string, PartRow>()
  const mcMap = new Map<string, McAgg>()

  for (const r of records) {
    const period = periodKey(r.session.sessionDate, granularity)
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

    if (r.machineId && r.machine) {
      const mk = `${r.machineId}|${period}`
      let bd = 0
      for (const b of r.breakdownLogs) bd += b.breakTimeMin
      let ng = 0
      for (const n of r.ngLogs) ng += n.ngQty

      if (!mcMap.has(mk)) {
        mcMap.set(mk, {
          machineId: r.machineId,
          mcNo: r.machine.mcNo,
          lineCode: r.machine.line.lineCode,
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
      const performance = calcPerformance(m.okQty, m.targetQty)
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
      const sd = r.session.sessionDate
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
      const sd = r.session.sessionDate
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

  return NextResponse.json({
    granularity,
    byOperator,
    byPart,
    byMachine,
    operatorMonthMatrix,
  })
}
