import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProductionReportLineAccess } from '@/lib/permissions/production-report-access'
import { redirect } from 'next/navigation'
import { ReportClient } from './ReportLoader'

export default async function ReportPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [departments, divisions, sections, lineAccess] = await Promise.all([
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
    getProductionReportLineAccess(session),
  ])

  if (!lineAccess.globalAllowed && lineAccess.lines.length === 0) redirect('/')

  const allowedSectionIds = new Set(
    lineAccess.lines.flatMap((line) => (line.isActive && line.sectionId ? [line.sectionId] : [])),
  )
  const visibleSections = sections.filter((section) => allowedSectionIds.has(section.id))
  const allowedDivisionIds = new Set(visibleSections.map((section) => section.divisionId))
  const visibleDivisions = divisions.filter((division) => allowedDivisionIds.has(division.id))
  const allowedDepartmentIds = new Set(visibleDivisions.map((division) => division.departmentId))
  const visibleDepartments = departments.filter((department) => allowedDepartmentIds.has(department.id))

  return (
    <ReportClient
      departments={JSON.parse(JSON.stringify(visibleDepartments))}
      divisions={JSON.parse(JSON.stringify(visibleDivisions))}
      sections={JSON.parse(JSON.stringify(visibleSections))}
    />
  )
}
