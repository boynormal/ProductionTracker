'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Factory, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useI18n } from '@/lib/i18n'
import { useDashboardNav, type DashboardNavItem } from '@/components/layout/useDashboardNav'

type Props = {
  userRole?: string
}

function groupChildActive(pathname: string, item: Extract<DashboardNavItem, { kind: 'group' }>) {
  return item.children.some((c) => pathname.startsWith(c.href))
}

export function NavRail({ userRole }: Props) {
  const pathname = usePathname()
  const { t } = useI18n()
  const { items } = useDashboardNav()
  const [flyout, setFlyout] = useState<string | null>(null)

  const closeFlyout = useCallback(() => setFlyout(null), [])

  useEffect(() => {
    closeFlyout()
  }, [pathname, closeFlyout])

  useEffect(() => {
    if (!flyout) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFlyout()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flyout, closeFlyout])

  const openGroup = items.find(
    (i): i is Extract<DashboardNavItem, { kind: 'group' }> =>
      i.kind === 'group' && i.key === flyout,
  )

  return (
    <>
      <aside
        className="relative z-40 hidden h-full w-16 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
        aria-label="Main navigation"
      >
        <div className="flex flex-col items-center border-b border-slate-200 py-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
            title="Production Tracker"
          >
            <Factory size={22} />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1 py-3">
          {items.map((item) => {
            if (item.kind === 'group' && item.roles && userRole && !item.roles.includes(userRole)) {
              return null
            }

            if (item.kind === 'link') {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700',
                    active && 'bg-blue-50 text-blue-700',
                  )}
                  title={item.label}
                >
                  {item.icon}
                </Link>
              )
            }

            const g = item
            const childActive = groupChildActive(pathname, g)
            const flyoutOpen = flyout === g.key

            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setFlyout(flyoutOpen ? null : g.key)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700',
                  (flyoutOpen || childActive) && 'bg-blue-50 text-blue-700',
                )}
                title={g.label}
                aria-expanded={flyoutOpen}
              >
                {g.icon}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center border-t border-slate-200 py-3">
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/login' })}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            title={t('logout')}
            aria-label={t('logout')}
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {flyout && openGroup && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 hidden bg-black/20 lg:block"
            onClick={closeFlyout}
          />
          <div
            className="fixed bottom-0 left-16 top-0 z-40 hidden w-56 flex-col border-r border-slate-200 bg-white shadow-xl lg:flex"
            role="dialog"
            aria-label={openGroup.label}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">{openGroup.label}</p>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              <ul className="space-y-0.5">
                {openGroup.children.map((child) => {
                  const active = pathname.startsWith(child.href)
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        className={cn(
                          'block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-700',
                          active && 'bg-blue-50 font-medium text-blue-700',
                        )}
                        onClick={closeFlyout}
                      >
                        {child.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </>
      )}
    </>
  )
}
