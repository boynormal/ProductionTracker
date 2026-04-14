import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcMtbfMttr } from '@/lib/utils/mtbf'
import { parseThaiCalendarDateUtc, dayEndExclusiveUTC } from '@/lib/time-utils'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const machineId = searchParams.get('machineId')
  const lineId    = searchParams.get('lineId')
  const divisionCode = searchParams.get('divisionCode')
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const start = parseThaiCalendarDateUtc(startDate)
  const endDay = parseThaiCalendarDateUtc(endDate)
  if (!start || !endDay) {
    return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 })
  }
  const end = dayEndExclusiveUTC(endDay)

  let machines: { id: string; mcNo: string; line: { lineCode: string } }[]

  if (machineId) {
    machines = await prisma.machine.findMany({
      where: { id: machineId },
      select: { id: true, mcNo: true, line: { select: { lineCode: true } } },
    })
  } else if (lineId) {
    machines = await prisma.machine.findMany({
      where: { lineId, isActive: true },
      select: { id: true, mcNo: true, line: { select: { lineCode: true } } },
      orderBy: { mcNo: 'asc' },
    })
  } else {
    machines = await prisma.machine.findMany({
      where: {
        isActive: true,
        ...(divisionCode ? { line: { divisionCode } } : {}),
      },
      select: { id: true, mcNo: true, line: { select: { lineCode: true } } },
      orderBy: { mcNo: 'asc' },
    })
  }

  const data = await Promise.all(
    machines.map(async (m) => {
      const result = await calcMtbfMttr(m.id, start, end)
      return {
        machineId:          m.id,
        mcNo:               m.mcNo,
        lineName:           m.line.lineCode,
        mtbf:               result.mtbf,
        mttr:               result.mttr,
        failureCount:       result.failureCount,
        totalRunHours:      result.totalUptimeHr,
        totalDowntimeHours: result.totalDowntimeHr,
      }
    }),
  )

  data.sort((a, b) => {
    const byLine = a.lineName.localeCompare(b.lineName, 'th', { numeric: true, sensitivity: 'base' })
    if (byLine !== 0) return byLine
    return a.mcNo.localeCompare(b.mcNo, 'th', { numeric: true, sensitivity: 'base' })
  })

  return NextResponse.json({ data })
}
