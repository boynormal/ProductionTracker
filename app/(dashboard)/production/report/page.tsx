import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReportClient } from './ReportLoader'

export default async function ReportPage() {
  await auth()

  const lines = await prisma.line.findMany({ where: { isActive: true }, orderBy: { lineCode: 'asc' } })
  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    select: { id: true, mcNo: true, mcName: true, lineId: true },
    orderBy: { mcNo: 'asc' },
  })

  return (
    <ReportClient
      lines={JSON.parse(JSON.stringify(lines))}
      machines={JSON.parse(JSON.stringify(machines))}
    />
  )
}
