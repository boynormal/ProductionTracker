import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiReportingDateUTC, dayEndExclusiveUTC } from '@/lib/utils/thai-time'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'
import { enrichSessionsWithCyclePerformance } from '@/lib/production/enrich-dashboard-sessions'
import { DashboardClient } from './DashboardLoader'

export default async function DashboardPage() {
  const session = await auth()
  const withLegacySessionDateFallback = false

  const reportingToday = getThaiReportingDateUTC()
  const reportingTodayIso = reportingToday.toISOString().slice(0, 10)
  const reportingTodayMonth = reportingTodayIso.slice(0, 7)

  const [machines, activeSessions, unreadAlertsCount, totalMachines, divisions, sections] = await Promise.all([
    prisma.productionSession.findMany({
      where: {
        ...reportingDateRangeWhere(reportingToday, dayEndExclusiveUTC(reportingToday), withLegacySessionDateFallback),
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
        ...reportingDateRangeWhere(reportingToday, dayEndExclusiveUTC(reportingToday), withLegacySessionDateFallback),
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

  const machinesEnriched = await enrichSessionsWithCyclePerformance(machines)

  return (
    <DashboardClient
      initialData={JSON.parse(JSON.stringify({
        mode: 'day',
        from: reportingTodayIso,
        to: reportingTodayIso,
        divisionId: null,
        sectionId: null,
        sessions: machinesEnriched,
        activeSessions,
        unreadAlertsCount,
        totalMachines,
      }))}
      initialDate={reportingTodayIso}
      initialMonth={reportingTodayMonth}
      divisions={divisions}
      sections={sections}
      userName={session?.user?.name ?? ''}
    />
  )
}
