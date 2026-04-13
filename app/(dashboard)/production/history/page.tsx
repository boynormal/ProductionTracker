import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getThaiTodayUTC, formatThaiDateUTCISO, dayEndExclusiveUTC } from '@/lib/utils/thai-time'
import { HistoryClient } from './HistoryLoader'

export default async function HistoryPage() {
  const session = await auth()

  const today = getThaiTodayUTC()
  const defaultDate = formatThaiDateUTCISO(today)

  const [sessions, lines] = await Promise.all([
    prisma.productionSession.findMany({
      where: { sessionDate: { gte: today, lt: dayEndExclusiveUTC(today) } },
      include: {
        line: {
          include: {
            section: {
              include: {
                division: {
                  include: { department: true },
                },
              },
            },
          },
        },
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        hourlyRecords: {
          include: {
            breakdownLogs: true,
            ngLogs: true,
            part: true,
            operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
          },
          orderBy: { hourSlot: 'asc' },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { shiftType: 'asc' }],
    }),
    prisma.line.findMany({
      where: { isActive: true },
      include: {
        section: {
          include: {
            division: {
              include: { department: true },
            },
          },
        },
      },
      orderBy: { lineCode: 'asc' },
    }),
  ])

  return (
    <HistoryClient
      initialSessions={JSON.parse(JSON.stringify(sessions))}
      lines={JSON.parse(JSON.stringify(lines))}
      defaultDate={defaultDate}
      userRole={session?.user?.role}
    />
  )
}
