import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { QrGeneratorClient } from './QrGeneratorClient'

export default async function QrGeneratorPage() {
  const session = await auth()
  if (!session) redirect('/')

  const canView = await checkPermissionForSession(session, 'menu.master.machines', {
    menuPath: '/master/machines',
  })
  if (!canView) redirect('/')

  const [lines, activeTargetCounts] = await Promise.all([
    prisma.line.findMany({
      where: { isActive: true },
      include: {
        section: {
          include: {
            division: { select: { id: true, divisionCode: true, divisionName: true } },
          },
        },
      },
      orderBy: { lineCode: 'asc' },
    }),
    prisma.linePartTarget.groupBy({
      by: ['lineId'],
      where: { isActive: true },
      _count: { _all: true },
    }),
  ])
  const countByLineId = new Map(activeTargetCounts.map((row) => [row.lineId, row._count._all]))
  const linesWithReadiness = lines.map((line) => {
    const activeLineTargetCount = countByLineId.get(line.id) ?? 0
    return {
      ...line,
      activeLineTargetCount,
      qrReady: activeLineTargetCount > 0,
    }
  })

  return <QrGeneratorClient lines={JSON.parse(JSON.stringify(linesWithReadiness))} />
}
