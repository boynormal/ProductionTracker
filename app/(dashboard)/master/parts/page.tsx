import { prisma } from '@/lib/prisma'
import { PartsPageClient } from './PartsPageClient'

export default async function PartsPage() {
  const [parts, customers] = await Promise.all([
    prisma.part.findMany({
      where: { isActive: true },
      include: {
        customer: true,
        targets: {
          where: { isActive: true },
          include: {
            machine: {
              select: {
                mcNo: true,
                mcName: true,
                line: { select: { lineCode: true } },
              },
            },
          },
        },
        lineTargets: {
          where: { isActive: true },
          include: {
            line: { select: { lineCode: true, lineName: true } },
          },
        },
      },
      orderBy: { partSamco: 'asc' },
    }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { customerCode: 'asc' } }),
  ])

  return (
    <PartsPageClient
      parts={JSON.parse(JSON.stringify(parts))}
      customers={JSON.parse(JSON.stringify(customers))}
    />
  )
}
