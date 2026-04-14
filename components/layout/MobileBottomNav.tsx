'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bell, Menu, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useI18n } from '@/lib/i18n'

type Props = {
  onOpenMenu: () => void
  allowedMenuKeys?: string[]
}

export function MobileBottomNav({ onOpenMenu, allowedMenuKeys = [] }: Props) {
  const pathname = usePathname()
  const { t } = useI18n()
  const allowed = new Set(allowedMenuKeys)

  const recordActive = pathname.startsWith('/production/record')
  const canDashboard = allowed.size === 0 || allowed.has('menu.dashboard')
  const canRecord = allowed.size === 0 || allowed.has('menu.production.record')
  const canAlerts = allowed.size === 0 || allowed.has('menu.alerts')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      aria-label="Quick navigation"
    >
      <div className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1">
        {canDashboard ? (
          <Link
            href="/"
            className={cn(
              'flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] text-slate-600',
              pathname === '/' && 'font-medium text-blue-700',
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="truncate">{t('dashboard')}</span>
          </Link>
        ) : <div className="min-w-[3.5rem]" />}

        {canRecord ? (
          <Link
            href="/production/record"
            className={cn(
              'relative -mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-slate-50 transition hover:bg-blue-700',
              recordActive && 'ring-blue-100',
            )}
            aria-current={recordActive ? 'page' : undefined}
            title={t('productionRecord')}
            aria-label={t('productionRecord')}
          >
            <ClipboardList className="h-7 w-7" strokeWidth={2} />
          </Link>
        ) : <div className="h-14 w-14" />}

        {canAlerts ? (
          <Link
            href="/alerts"
            className={cn(
              'flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] text-slate-600',
              pathname.startsWith('/alerts') && 'font-medium text-blue-700',
            )}
          >
            <Bell className="h-5 w-5" />
            <span className="truncate">{t('navAlerts')}</span>
          </Link>
        ) : <div className="min-w-[3.5rem]" />}

        <button
          type="button"
          onClick={onOpenMenu}
          className="flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] text-slate-600 hover:text-blue-700"
        >
          <Menu className="h-5 w-5" />
          <span>{t('navMenu')}</span>
        </button>
      </div>
    </nav>
  )
}
