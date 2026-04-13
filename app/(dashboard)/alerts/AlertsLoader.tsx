'use client'
import dynamic from 'next/dynamic'

export const NotificationsClient = dynamic(
  () => import('../admin/notifications/NotificationsClient').then(m => m.NotificationsClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    ),
  }
)
