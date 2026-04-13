'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

type Props = {
  children: React.ReactNode
  userName?: string
  userRole?: string
}

export function DashboardShell({ children, userName, userRole }: Props) {
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)

  const closeNav = useCallback(() => setNavOpen(false), [])

  useEffect(() => {
    closeNav()
  }, [pathname, closeNav])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeNav()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeNav])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden"
          onClick={closeNav}
        />
      )}

      <Sidebar
        id="dashboard-nav-sidebar"
        userRole={userRole}
        onNavigate={closeNav}
        className={
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out ' +
          'lg:static lg:z-auto lg:translate-x-0 ' +
          (navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')
        }
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setNavOpen(o => !o)}
          menuOpen={navOpen}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
