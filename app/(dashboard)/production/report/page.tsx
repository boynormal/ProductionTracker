import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReportClient } from './ReportLoader'

export default async function ReportPage() {
  await auth()

  const sections = await prisma.section.findMany({
    where: { isActive: true },
    select: { id: true, sectionCode: true, sectionName: true },
    orderBy: { sectionCode: 'asc' },
  })

  return <ReportClient sections={JSON.parse(JSON.stringify(sections))} />
}
