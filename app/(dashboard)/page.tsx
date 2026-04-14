import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'
import { DashboardClient } from './DashboardLoader'

export default async function DashboardPage() {
  const session = await auth()

  const today = getThaiTodayUTC()
  const todayIso = today.toISOString().slice(0, 10)
  const todayMonth = todayIso.slice(0, 7)

  const [machines, activeSessions, unreadAlertsCount, totalMachines] = await Promise.all([
    prisma.productionSession.findMany({
      where: { sessionDate: today, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
      include: {
        machine: true,
        line: true,
        hourlyRecords: {
          include: { breakdownLogs: true, ngLogs: true },
        },
      },
      orderBy: [{ line: { lineCode: 'asc' } }, { id: 'asc' }],
    }),
    prisma.productionSession.count({ where: { sessionDate: today, status: 'IN_PROGRESS' } }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.machine.count({ where: { isActive: true } }),
  ])

  return (
    <DashboardClient
      initialData={JSON.parse(JSON.stringify({
        mode: 'day',
        from: todayIso,
        to: todayIso,
        sessions: machines,
        activeSessions,
        unreadAlertsCount,
        totalMachines,
      }))}
      initialDate={todayIso}
      initialMonth={todayMonth}
      userName={session?.user?.name ?? ''}
    />
  )
}
