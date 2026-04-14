'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Factory, ChevronDown, ChevronRight, LogOut, User, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { useI18n } from '@/lib/i18n'
import { useDashboardNav, type DashboardNavItem } from '@/components/layout/useDashboardNav'

type Props = {
  open: boolean
  onClose: () => void
  userName?: string
  userRole?: string
}

export function MobileNavDrawer({ open, onClose, userName, userRole }: Props) {
  const { t } = useI18n()
  const pathname = usePathname()
  const { items } = useDashboardNav()
  const [openGroups, setOpenGroups] = useState<string[]>(['production', 'master'])

  const toggle = (key: string) =>
    setOpenGroups((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]))

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-[60] bg-black/40 lg:hidden"
        onClick={onClose}
      />
      <aside
        id="dashboard-mobile-nav-drawer"
        className="fixed inset-y-0 left-0 z-[70] flex w-[min(20rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-xl lg:hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Factory size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Production</p>
              <p className="text-xs text-slate-500">Tracker</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {items.map((item) => {
            if (item.kind === 'group' && item.roles && userRole && !item.roles.includes(userRole)) {
              return null
            }

            if (item.kind === 'link') {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('sidebar-item', isActive && 'active')}
                  onClick={onClose}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            }

            const groupKey = item.key
            const isGroupOpen = openGroups.includes(groupKey)
            const isChildActive = item.children.some((c) => pathname.startsWith(c.href))

            return (
              <div key={groupKey} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggle(groupKey)}
                  className={cn(
                    'sidebar-item w-full justify-between',
                    isChildActive && !isGroupOpen && 'text-blue-700 bg-blue-50',
                  )}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    {item.label}
                  </span>
                  {isGroupOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isGroupOpen && (
                  <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                    {item.children.map((child) => {
                      const isActive = pathname.startsWith(child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-sm text-slate-600 hover:text-blue-700',
                            isActive && 'font-medium text-blue-700',
                          )}
                          onClick={onClose}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3">
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <User size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{userName ?? '—'}</p>
              {userRole ? <p className="truncate text-xs text-slate-500">{userRole}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <LogOut size={16} />
            {t('logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
