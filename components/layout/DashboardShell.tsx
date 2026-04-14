'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NavRail } from '@/components/layout/NavRail'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer'
import { Header } from '@/components/layout/Header'

type Props = {
  children: React.ReactNode
  userName?: string
  userRole?: string
}

export function DashboardShell({ children, userName, userRole }: Props) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  useEffect(() => {
    closeMobileMenu()
  }, [pathname, closeMobileMenu])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobileMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeMobileMenu])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <NavRail userRole={userRole} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        <main className="flex min-h-0 flex-1 min-w-0 flex-col overflow-auto p-4 sm:p-6 pb-[5.5rem] lg:pb-6">
          {children}
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setMobileMenuOpen(true)} />
      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        userName={userName}
        userRole={userRole}
      />
    </div>
  )
}
