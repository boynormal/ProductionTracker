import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { NotificationsClient } from './NotificationsLoader'

export default async function NotificationsPage() {
  const session = await auth()
  if (!session || !['ADMIN', 'MANAGER', 'SUPERVISOR'].includes(session.user.role)) redirect('/')

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return <NotificationsClient notifications={JSON.parse(JSON.stringify(notifications))} />
}
