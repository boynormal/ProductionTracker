'use client'

import dynamic from 'next/dynamic'

export const LogsClient = dynamic(
  () => import('./LogsClient').then((m) => m.LogsClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    ),
  },
)

