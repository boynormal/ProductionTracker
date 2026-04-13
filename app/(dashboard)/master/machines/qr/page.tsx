import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { QrGeneratorClient } from './QrGeneratorClient'

export default async function QrGeneratorPage() {
  const session = await auth()
  if (!session || !['ADMIN', 'ENGINEER'].includes(session.user.role)) redirect('/')

  const lines = await prisma.line.findMany({
    where: { isActive: true },
    include: {
      section: {
        include: {
          division: { select: { id: true, divisionCode: true, divisionName: true } },
        },
      },
    },
    orderBy: { lineCode: 'asc' },
  })

  return <QrGeneratorClient lines={JSON.parse(JSON.stringify(lines))} />
}
