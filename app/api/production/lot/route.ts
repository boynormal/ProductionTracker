import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getThaiTodayUTC,
  dayEndExclusiveUTC,
  parseThaiCalendarDateUtc,
} from '@/lib/time-utils'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'
import { requireApiPermission } from '@/lib/permissions/route-guard'

type Mode = 'day' | 'month'
const WITH_LEGACY = false

function monthToRange(monthStr: string): { from: Date; toExclusive: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthStr.trim())
  if (!m) return null
  const y = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  const from = new Date(Date.UTC(y, month - 1, 1))
  const toExclusive = new Date(Date.UTC(y, month, 1))
  return { from, toExclusive }
}

export async function GET(req: NextRequest) {
  const guard = await requireApiPermission(req, 'menu.production.lot', { menuPath: '/production/lot' })
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(req.url)
  const modeRaw = searchParams.get('mode')
  const mode: Mode = modeRaw === 'month' ? 'month' : 'day'
  const lot = searchParams.get('lot')?.trim() || undefined
  const divisionIdParam = searchParams.get('divisionId')?.trim() || undefined
  const lineIdParam = searchParams.get('lineId')?.trim() || undefined
  const partIdParam = searchParams.get('partId')?.trim() || undefined
  const takeParam = Number(searchParams.get('take') ?? '500')
  const take = isNaN(takeParam) || takeParam < 1 ? 500 : Math.min(takeParam, 1000)

  // ต้องมีอย่างน้อยหนึ่งตัวกรอง: date/month หรือ lot
  const hasDateFilter = searchParams.has('date') || searchParams.has('month') || mode === 'day'
  const hasLotFilter = !!lot
  if (!hasDateFilter && !hasLotFilter) {
    return NextResponse.json({ error: 'Provide at least date, month, or lot param' }, { status: 400 })
  }

  // ─── Date range ───
  const today = getThaiTodayUTC()
  let from: Date | undefined
  let toExclusive: Date | undefined

  if (mode === 'day') {
    const dateStr = searchParams.get('date')
    if (dateStr) {
      const d = parseThaiCalendarDateUtc(dateStr)
      if (!d) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
      from = d
      toExclusive = dayEndExclusiveUTC(d)
    } else {
      from = today
      toExclusive = dayEndExclusiveUTC(today)
    }
  } else {
    const monthStr = searchParams.get('month')
    if (!monthStr) return NextResponse.json({ error: 'month is required (YYYY-MM) for month mode' }, { status: 400 })
    const range = monthToRange(monthStr)
    if (!range) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    from = range.from
    toExclusive = range.toExclusive
  }

  // ─── Line filter ───
  let sessionLineWhere: Prisma.ProductionSessionWhereInput['line'] | undefined

  if (lineIdParam) {
    sessionLineWhere = { id: lineIdParam }
  } else if (divisionIdParam) {
    const sections = await prisma.section.findMany({
      where: { isActive: true, divisionId: divisionIdParam },
      select: { id: true },
    })
    if (sections.length === 0) sessionLineWhere = { id: 'no-match' }
    else sessionLineWhere = { sectionId: { in: sections.map((s) => s.id) } }
  }

  // ─── Build where ───
  const sessionDateWhere = reportingDateRangeWhere(from, toExclusive, WITH_LEGACY)

  const where: Prisma.HourlyRecordWhereInput = {
    session: {
      ...sessionDateWhere,
      ...(sessionLineWhere ? { line: sessionLineWhere } : {}),
    },
    ...(partIdParam ? { partId: partIdParam } : {}),
    ...(lot ? { lotNumber: { contains: lot, mode: 'insensitive' } } : {}),
  }

  const records = await prisma.hourlyRecord.findMany({
    where,
    include: {
      session: {
        include: {
          line: { select: { id: true, lineCode: true, lineName: true } },
          machine: { select: { id: true, mcNo: true, brand: true } },
        },
      },
      part: {
        include: {
          customer: { select: { id: true, customerCode: true, customerName: true } },
        },
      },
      operator: {
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      },
      breakdownLogs: {
        include: { problemCategory: { select: { id: true, code: true, name: true } } },
      },
      ngLogs: {
        include: { problemCategory: { select: { id: true, code: true, name: true } } },
      },
    },
    orderBy: [{ session: { reportingDate: 'desc' } }, { session: { shiftType: 'asc' } }, { hourSlot: 'asc' }],
    take,
  })

  return NextResponse.json({
    data: records,
    total: records.length,
    from: from.toISOString().slice(0, 10),
    to: new Date(toExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  })
}
