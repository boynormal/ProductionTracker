import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { MachinesClient } from './MachinesClient'

export default async function MachinesPage() {
  const session = await auth()

  const lineInclude = {
    section: {
      include: {
        division: { select: { id: true, divisionCode: true, divisionName: true } },
      },
    },
  } as const

  const [machines, lines, divisions, sections] = await Promise.all([
    prisma.machine.findMany({
      where: { isActive: true },
      include: {
        line: { include: lineInclude },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
        },
        // List view: ids only — detail page loads full targets
        partTargets: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: [{ line: { lineCode: 'asc' } }, { mcNo: 'asc' }],
    }),
    prisma.line.findMany({
      where: { isActive: true },
      include: lineInclude,
      orderBy: { lineCode: 'asc' },
    }),
    prisma.division.findMany({
      where: { isActive: true },
      orderBy: { divisionCode: 'asc' },
      select: { id: true, divisionCode: true, divisionName: true },
    }),
    prisma.section.findMany({
      where: { isActive: true, ...sectionWhereMasterList },
      select: { id: true, sectionCode: true, sectionName: true, divisionId: true },
      orderBy: { sectionCode: 'asc' },
    }),
  ])

  return (
    <MachinesClient
      machines={JSON.parse(JSON.stringify(machines))}
      lines={JSON.parse(JSON.stringify(lines))}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
      userRole={session?.user?.role}
    />
  )
}
