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
  alertBadgeCount?: number
  allowedMenuKeys?: string[]
}

export function DashboardShell({ children, userName, userRole, alertBadgeCount = 0, allowedMenuKeys = [] }: Props) {
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
      <NavRail userRole={userRole} allowedMenuKeys={allowedMenuKeys} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header userName={userName} userRole={userRole} alertBadgeCount={alertBadgeCount} />
        {/* No padding-top on scroll `main` — it breaks sticky table headers (gap + rows showing above thead). */}
        <main className="flex min-h-0 flex-1 min-w-0 flex-col overflow-auto px-4 sm:px-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[5.5rem] pt-4 sm:pt-6 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setMobileMenuOpen(true)} allowedMenuKeys={allowedMenuKeys} />
      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={closeMobileMenu}
        userName={userName}
        userRole={userRole}
        allowedMenuKeys={allowedMenuKeys}
      />
    </div>
  )
}
