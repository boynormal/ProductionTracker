import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReportClient } from './ReportLoader'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { redirect } from 'next/navigation'

export default async function ReportPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const canView = await checkPermissionForSession(session, 'menu.production.report', {
    menuPath: '/production/report',
  })
  if (!canView) redirect('/')

  const sections = await prisma.section.findMany({
    where: { isActive: true },
    select: { id: true, sectionCode: true, sectionName: true },
    orderBy: { sectionCode: 'asc' },
  })

  return <ReportClient sections={JSON.parse(JSON.stringify(sections))} />
}
