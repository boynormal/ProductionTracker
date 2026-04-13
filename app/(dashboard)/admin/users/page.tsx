import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const session = await auth()
  if (!session || !['ADMIN'].includes(session.user.role)) redirect('/')

  const [users, departments, divisions, sections, parts] = await Promise.all([
    prisma.user.findMany({
      include: {
        department: true,
        division: true,
        section: true,
        capableParts: { include: { part: true } },
      },
      orderBy: { employeeCode: 'asc' },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { departmentCode: 'asc' },
    }),
    prisma.division.findMany({
      where: { isActive: true },
      include: { department: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.section.findMany({
      where: { isActive: true },
      include: { division: true },
      orderBy: { sectionCode: 'asc' },
    }),
    prisma.part.findMany({
      where: { isActive: true },
      orderBy: { partSamco: 'asc' },
    }),
  ])

  return (
    <UsersClient
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
      parts={JSON.parse(JSON.stringify(parts))}
    />
  )
}
