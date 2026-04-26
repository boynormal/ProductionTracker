import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiTodayUTC, dayEndExclusiveUTC } from '@/lib/utils/thai-time'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'
import { DashboardClient } from './DashboardLoader'

export default async function DashboardPage() {
  const session = await auth()
  const withLegacySessionDateFallback = false

  const today = getThaiTodayUTC()
  const todayIso = today.toISOString().slice(0, 10)
  const todayMonth = todayIso.slice(0, 7)

  const [machines, activeSessions, unreadAlertsCount, totalMachines, divisions, sections] = await Promise.all([
    prisma.productionSession.findMany({
      where: {
        ...reportingDateRangeWhere(today, dayEndExclusiveUTC(today), withLegacySessionDateFallback),
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        machine: true,
        line: true,
        hourlyRecords: {
          include: { breakdownLogs: true, ngLogs: true },
        },
      },
      orderBy: [{ line: { lineCode: 'asc' } }, { id: 'asc' }],
    }),
    prisma.productionSession.count({
      where: {
        ...reportingDateRangeWhere(today, dayEndExclusiveUTC(today), withLegacySessionDateFallback),
        status: 'IN_PROGRESS',
      },
    }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.machine.count({ where: { isActive: true } }),
    prisma.division.findMany({
      where: { isActive: true },
      orderBy: { divisionCode: 'asc' },
      select: { id: true, divisionCode: true, divisionName: true },
    }),
    prisma.section.findMany({
      where: { isActive: true },
      orderBy: { sectionCode: 'asc' },
      select: {
        id: true,
        sectionCode: true,
        sectionName: true,
        division: {
          select: {
            id: true,
          },
        },
      },
    }),
  ])

  return (
    <DashboardClient
      initialData={JSON.parse(JSON.stringify({
        mode: 'day',
        from: todayIso,
        to: todayIso,
        divisionId: null,
        sectionId: null,
        sessions: machines,
        activeSessions,
        unreadAlertsCount,
        totalMachines,
      }))}
      initialDate={todayIso}
      initialMonth={todayMonth}
      divisions={divisions}
      sections={sections}
      userName={session?.user?.name ?? ''}
    />
  )
}
