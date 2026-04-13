import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NotificationsClient } from './AlertsLoader'

export default async function AlertsPage() {
  await auth()

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <NotificationsClient
      notifications={JSON.parse(JSON.stringify(notifications))}
      titleKey="alertsPage"
    />
  )
}
