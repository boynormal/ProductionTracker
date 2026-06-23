import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { prisma } from '@/lib/prisma'
import { getThaiTodayUTC, formatThaiDateUTCISO } from '@/lib/time-utils'
import { OtPlanClient } from './OtPlanClient'

export default async function OtPlanPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const canEditPlan = session.user?.id
    ? await checkPermissionForSession(session, 'api.production.otplan.write', {
        apiPath: '/api/production/ot-plan',
      })
    : false

  const today = getThaiTodayUTC()
  const todayIso = formatThaiDateUTCISO(today)
  const initialMonth = todayIso.slice(0, 7) // YYYY-MM
  const initialYear = todayIso.slice(0, 4)  // YYYY

  const [divisions, sections, lines] = await Promise.all([
    prisma.division.findMany({
      where: { isActive: true },
      select: { id: true, divisionCode: true, divisionName: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.section.findMany({
      where: { isActive: true },
      select: { id: true, sectionCode: true, sectionName: true, divisionId: true },
      orderBy: { sectionCode: 'asc' },
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
            sectionCode: true,
            sectionName: true,
            divisionId: true,
            division: { select: { id: true } },
          },
        },
      },
      orderBy: { lineCode: 'asc' },
    }),
  ])

  return (
    <OtPlanClient
      canEditPlan={canEditPlan}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
      lines={JSON.parse(JSON.stringify(lines))}
      initialMonth={initialMonth}
      initialYear={initialYear}
    />
  )
}
