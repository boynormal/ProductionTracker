import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayEndExclusiveUTC, getThaiTodayUTC, parseThaiCalendarDateUtc } from '@/lib/time-utils'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'

type Mode = 'day' | 'month'
const WITH_LEGACY_SESSION_DATE_FALLBACK = false

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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const modeRaw = searchParams.get('mode')
  const mode: Mode = modeRaw === 'month' ? 'month' : 'day'

  const today = getThaiTodayUTC()
  let from = today
  let toExclusive = dayEndExclusiveUTC(today)

  if (mode === 'day') {
    const dateStr = searchParams.get('date')
    if (dateStr) {
      const d = parseThaiCalendarDateUtc(dateStr)
      if (!d) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
      from = d
      toExclusive = dayEndExclusiveUTC(d)
    }
  } else {
    const monthStr = searchParams.get('month')
    if (!monthStr) return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
    const range = monthToRange(monthStr)
    if (!range) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    from = range.from
    toExclusive = range.toExclusive
  }

  const sectionIdParam = searchParams.get('sectionId')?.trim()
  let lineFilter: Prisma.LineWhereInput | undefined
  if (sectionIdParam) {
    const sec = await prisma.section.findFirst({
      where: { id: sectionIdParam, isActive: true },
      select: { id: true },
    })
    if (!sec) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    lineFilter = { sectionId: sectionIdParam }
  }

  const sessionWhere: Prisma.ProductionSessionWhereInput = {
    ...reportingDateRangeWhere(from, toExclusive, WITH_LEGACY_SESSION_DATE_FALLBACK),
    status: { in: ['IN_PROGRESS', 'COMPLETED'] },
    ...(lineFilter ? { line: lineFilter } : {}),
  }

  const [sessions, activeSessions, unreadAlertsCount, totalMachines] = await Promise.all([
    prisma.productionSession.findMany({
      where: sessionWhere,
      include: {
        machine: true,
        line: true,
        hourlyRecords: { include: { breakdownLogs: true, ngLogs: true } },
      },
      orderBy: [{ reportingDate: 'asc' }, { sessionDate: 'asc' }, { line: { lineCode: 'asc' } }, { id: 'asc' }],
    }),
    prisma.productionSession.count({
      where: {
        ...reportingDateRangeWhere(from, toExclusive, WITH_LEGACY_SESSION_DATE_FALLBACK),
        status: 'IN_PROGRESS',
        ...(lineFilter ? { line: lineFilter } : {}),
      },
    }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.machine.count({
      where: {
        isActive: true,
        ...(lineFilter ? { line: lineFilter } : {}),
      },
    }),
  ])

  return NextResponse.json({
    mode,
    from: from.toISOString().slice(0, 10),
    to: new Date(toExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    sectionId: sectionIdParam || null,
    sessions,
    activeSessions,
    unreadAlertsCount,
    totalMachines,
  })
}

