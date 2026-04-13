'use client'

import { signOut } from 'next-auth/react'
import { Bell, LogOut, Globe, User, Menu, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

interface HeaderProps {
  userName?: string
  userRole?: string
  unreadCount?: number
  /** เปิด/ปิดเมนู (แสดงเฉพาะจอ &lt; lg) */
  onMenuClick?: () => void
  menuOpen?: boolean
}

export function Header({ userName, userRole, unreadCount = 0, onMenuClick, menuOpen }: HeaderProps) {
  const { locale, setLocale, t } = useI18n()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden -ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-expanded={menuOpen ?? false}
            aria-controls="dashboard-nav-sidebar"
            aria-label={t('navMenu')}
          >
            {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
          </button>
        )}
        <span className="truncate font-semibold text-blue-600">Production Tracker</span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Language toggle */}
        <button
          onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <Globe size={13} />
          {locale === 'th' ? 'EN' : 'ไทย'}
        </button>

        {/* Notification bell */}
        <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User info */}
        <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <User size={14} />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-slate-800 leading-none">{userName ?? '-'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{userRole ?? ''}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">{t('logout')}</span>
        </button>
      </div>
    </header>
  )
}
