import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiReportingDateUTC, dayEndExclusiveUTC } from '@/lib/utils/thai-time'
import { reportingDateRangeWhere } from '@/lib/reporting-date-query'
import { enrichSessionsWithCyclePerformance } from '@/lib/production/enrich-dashboard-sessions'
import { DashboardClient } from './DashboardLoader'

export default async function DashboardPage() {
  const session = await auth()
  const withLegacySessionDateFallback = false

  const reportingDate = getThaiReportingDateUTC()
  const reportingDateIso = reportingDate.toISOString().slice(0, 10)
  const reportingMonth = reportingDateIso.slice(0, 7)

  const [machines, activeSessions, unreadAlertsCount, totalMachines, divisions, sections] = await Promise.all([
    prisma.productionSession.findMany({
      where: {
        ...reportingDateRangeWhere(reportingDate, dayEndExclusiveUTC(reportingDate), withLegacySessionDateFallback),
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
        ...reportingDateRangeWhere(reportingDate, dayEndExclusiveUTC(reportingDate), withLegacySessionDateFallback),
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
        from: reportingDateIso,
        to: reportingDateIso,
        divisionId: null,
        sectionId: null,
        sessions: machinesEnriched,
        activeSessions,
        unreadAlertsCount,
        totalMachines,
      }))}
      initialDate={reportingDateIso}
      initialMonth={reportingMonth}
      divisions={divisions}
      sections={sections}
      userName={session?.user?.name ?? ''}
    />
  )
}
