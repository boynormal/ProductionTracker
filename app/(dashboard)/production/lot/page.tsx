import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getThaiReportingDateUTC, formatThaiDateUTCISO } from '@/lib/time-utils'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { LotClient } from './LotClient'

export default async function LotPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const canViewLot = await checkPermissionForSession(session, 'menu.production.lot', {
    menuPath: '/production/lot',
  })
  if (!canViewLot) redirect('/')

  const reportingToday = getThaiReportingDateUTC()
  const initialDate = formatThaiDateUTCISO(reportingToday)
  const initialMonth = initialDate.slice(0, 7) // YYYY-MM

  const [divisions, lines, parts] = await Promise.all([
    prisma.division.findMany({
      where: { isActive: true },
      select: { id: true, divisionCode: true, divisionName: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.line.findMany({
      where: { isActive: true },
      select: {
        id: true,
        lineCode: true,
        lineName: true,
        section: {
          select: {
            id: true,
            division: { select: { id: true } },
          },
        },
      },
      orderBy: { lineCode: 'asc' },
    }),
    prisma.part.findMany({
      where: { isActive: true },
      select: { id: true, partSamco: true, partNo: true, partName: true },
      orderBy: { partSamco: 'asc' },
    }),
  ])

  return (
    <LotClient
      userRole={session.user?.role}
      divisions={JSON.parse(JSON.stringify(divisions))}
      lines={JSON.parse(JSON.stringify(lines))}
      parts={JSON.parse(JSON.stringify(parts))}
      initialDate={initialDate}
      initialMonth={initialMonth}
    />
  )
}
