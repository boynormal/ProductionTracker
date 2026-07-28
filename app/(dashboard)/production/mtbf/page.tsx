import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { MtbfClient } from './MtbfClient'

export default async function MtbfPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const canView = await checkPermissionForSession(session, 'menu.production.mtbf', {
    menuPath: '/production/mtbf',
  })
  if (!canView) redirect('/')

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
