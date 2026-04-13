import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'
import { DashboardClient } from './DashboardLoader'

export default async function DashboardPage() {
  const session = await auth()

  const today = getThaiTodayUTC()

  const [machines, activeSessions, unreadAlertsCount, totalMachines] = await Promise.all([
    prisma.productionSession.findMany({
      where: { sessionDate: today, status: 'IN_PROGRESS' },
      include: {
        machine: true,
        line: true,
        hourlyRecords: {
          include: { breakdownLogs: true, ngLogs: true },
        },
      },
      orderBy: [{ line: { lineCode: 'asc' } }, { id: 'asc' }],
    }),
    prisma.productionSession.count({ where: { sessionDate: today } }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.machine.count({ where: { isActive: true } }),
  ])

  return (
    <DashboardClient
      sessions={JSON.parse(JSON.stringify(machines))}
      activeSessions={activeSessions}
      unreadAlertsCount={unreadAlertsCount}
      totalMachines={totalMachines}
      userName={session?.user?.name ?? ''}
    />
  )
}
