import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MtbfClient } from './MtbfClient'

export default async function MtbfPage() {
  await auth()

  const [divisions, lines] = await Promise.all([
    prisma.division.findMany({
      where: { isActive: true },
      select: { divisionCode: true, divisionName: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.line.findMany({
      where: { isActive: true },
      select: { id: true, lineCode: true, divisionCode: true },
      orderBy: { lineCode: 'asc' },
    }),
  ])
  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    select: { id: true, mcNo: true, mcName: true, lineId: true },
    orderBy: { mcNo: 'asc' },
  })

  return (
    <MtbfClient
      divisions={JSON.parse(JSON.stringify(divisions))}
      lines={JSON.parse(JSON.stringify(lines))}
      machines={JSON.parse(JSON.stringify(machines))}
    />
  )
}
