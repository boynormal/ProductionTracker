import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcAvailability, calcPerformance, calcQuality, calcOEE } from '@/lib/utils/oee'
import { parseThaiCalendarDateUtc, dayEndExclusiveUTC } from '@/lib/time-utils'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const lineId = searchParams.get('lineId')

  const where: any = { status: 'COMPLETED' }
  if (from && to) {
    const fromDate = parseThaiCalendarDateUtc(from)
    const toDate   = parseThaiCalendarDateUtc(to)
    if (!fromDate || !toDate) return NextResponse.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 })
    where.sessionDate = { gte: fromDate, lt: dayEndExclusiveUTC(toDate) }
  }
  if (lineId) where.lineId = lineId

  const sessions = await prisma.productionSession.findMany({
    where,
    include: {
      line: {
        select: {
          id: true,
          lineCode: true,
          lineName: true,
          section: {
            select: {
              sectionCode: true,
              sectionName: true,
              division: {
                select: {
                  divisionCode: true,
                  divisionName: true,
                  department: {
                    select: { departmentCode: true, departmentName: true },
                  },
                },
              },
            },
          },
        },
      },
      hourlyRecords: {
        include: { breakdownLogs: true, ngLogs: true },
      },
    },
  })

  // Group OEE by Line (not by machine)
  type LineGroup = {
    lineCode: string
    lineName: string
    sectionCode: string | null
    sectionName: string | null
    departmentCode: string | null
    departmentName: string | null
    sessions: number
    okQty: number
    ngQty: number
    targetQty: number
    bdMin: number
    totalHours: number
  }
  const grouped = new Map<string, LineGroup>()

  for (const sess of sessions) {
    const key = sess.lineId
    if (!grouped.has(key)) {
      grouped.set(key, {
        lineCode:       sess.line.lineCode,
        lineName:       sess.line.lineName,
        sectionCode:    sess.line.section?.sectionCode ?? null,
        sectionName:    sess.line.section?.sectionName ?? null,
        departmentCode: sess.line.section?.division?.department?.departmentCode ?? null,
        departmentName: sess.line.section?.division?.department?.departmentName ?? null,
        sessions: 0, okQty: 0, ngQty: 0, targetQty: 0, bdMin: 0, totalHours: 0,
      })
    }
    const g = grouped.get(key)!
    g.sessions++
    g.totalHours += sess.totalHours
    for (const rec of sess.hourlyRecords) {
      g.okQty     += rec.okQty
      g.targetQty += rec.targetQty
      for (const bd of rec.breakdownLogs) g.bdMin += bd.breakTimeMin
      for (const ng of rec.ngLogs) g.ngQty += ng.ngQty
    }
  }

  const data = Array.from(grouped.entries()).map(([lineId, g]) => {
    const availability = calcAvailability(g.totalHours * 60, g.bdMin)
    const performance  = calcPerformance(g.okQty + g.ngQty, g.targetQty)
    const quality      = calcQuality(g.okQty, g.ngQty)
    const oee          = calcOEE(availability, performance, quality)
    return { lineId, ...g, availability, performance, quality, oee }
  })

  data.sort((a, b) =>
    a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true, sensitivity: 'base' })
  )

  return NextResponse.json({ data })
}
