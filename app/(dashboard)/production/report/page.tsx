import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { ReportClient } from './ReportLoader'

export default async function ReportPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const canView = await checkPermissionForSession(session, 'menu.production.report', { menuPath: '/production/report' })
  if (!canView) redirect('/')

  const [departments, divisions, sections] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, departmentCode: true, departmentName: true },
      orderBy: { departmentCode: 'asc' },
    }),
    prisma.division.findMany({
      where: { isActive: true },
      select: { id: true, divisionCode: true, divisionName: true, departmentId: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.section.findMany({
      where: { isActive: true },
      select: { id: true, sectionCode: true, sectionName: true, divisionId: true },
      orderBy: { sectionCode: 'asc' },
    }),
  ])

  return (
    <ReportClient
      departments={JSON.parse(JSON.stringify(departments))}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
    />
  )
}
