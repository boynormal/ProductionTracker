import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { OrganizationClient } from './OrganizationClient'

export default async function DepartmentsPage() {
  const session = await auth()
  const canEdit = session?.user?.role === 'ADMIN' || session?.user?.role === 'MANAGER'

  const [departments, divisions, sections, tree] = await Promise.all([
    prisma.department.findMany({
      where: { NOT: { departmentCode: 'CAP-IMP' } },
      orderBy: { departmentCode: 'asc' },
      include: {
        _count: { select: { divisions: true } },
        divisions: {
          orderBy: { divisionCode: 'asc' },
          select: { divisionCode: true, divisionName: true, isActive: true },
        },
      },
    }),
    prisma.division.findMany({
      where: {
        divisionCode: { not: 'CAP-IMP-DIV' },
        department: { departmentCode: { not: 'CAP-IMP' } },
      },
      orderBy: { divisionCode: 'asc' },
      include: {
        department: true,
        _count: { select: { sections: true } },
        sections: {
          orderBy: { sectionCode: 'asc' },
          select: { sectionCode: true, sectionName: true, isActive: true },
        },
      },
    }),
    prisma.section.findMany({
      where: sectionWhereMasterList,
      orderBy: { sectionCode: 'asc' },
      include: {
        division: { include: { department: true } },
        _count: { select: { lines: true, users: true } },
        lines: {
          orderBy: { lineCode: 'asc' },
          select: { lineCode: true, lineName: true },
        },
        users: {
          orderBy: { employeeCode: 'asc' },
          take: 250,
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    }),
    prisma.department.findMany({
      where: {
        isActive: true,
        NOT: { departmentCode: 'CAP-IMP' },
      },
      orderBy: { departmentCode: 'asc' },
      include: {
        divisions: {
          where: {
            isActive: true,
            divisionCode: { not: 'CAP-IMP-DIV' },
          },
          orderBy: { divisionCode: 'asc' },
          include: {
            sections: { where: { isActive: true }, orderBy: { sectionCode: 'asc' } },
          },
        },
      },
    }),
  ])

  return (
    <OrganizationClient
      departments={JSON.parse(JSON.stringify(departments))}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
      tree={JSON.parse(JSON.stringify(tree))}
      canEdit={canEdit}
    />
  )
}
