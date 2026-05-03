'use client'
import dynamic from 'next/dynamic'

export const LoginClient = dynamic(
  () => import('./LoginClient').then(m => m.LoginClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-800 via-blue-700 to-blue-600">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    ),
  }
)
