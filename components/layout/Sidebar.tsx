'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings2,
  Bell,
  ChevronDown,
  ChevronRight,
  Factory,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

interface NavItem {
  href?: string
  label: string
  icon: React.ReactNode
  children?: { href: string; label: string }[]
  roles?: string[]
}

type SidebarProps = {
  userRole?: string
  /** ปิด drawer มือถือหลังคลิกลิงก์ */
  onNavigate?: () => void
  className?: string
  id?: string
}

export function Sidebar({ userRole, onNavigate, className, id }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const [openGroups, setOpenGroups] = useState<string[]>(['production', 'master'])

  const toggle = (key: string) =>
    setOpenGroups(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key])

  const navGroups: { key: string; items: NavItem[] }[] = [
    {
      key: 'main',
      items: [
        { href: '/', label: t('dashboard'), icon: <LayoutDashboard size={18} /> },
        { href: '/alerts', label: t('navAlerts'), icon: <Bell size={18} /> },
      ],
    },
    {
      key: 'production',
      items: [
        {
          label: t('production'),
          icon: <Factory size={18} />,
          children: [
            { href: '/production/record',  label: t('productionRecord') },
            { href: '/production/history', label: t('productionHistory') },
            { href: '/production/report',  label: t('productionReport') },
            { href: '/production/mtbf',    label: 'MTBF/MTTR' },
          ],
        },
      ],
    },
    {
      key: 'master',
      items: [
        {
          label: t('master'),
          icon: <Settings2 size={18} />,
          children: [
            { href: '/master/lines',        label: t('masterLines') },
            { href: '/master/machines',     label: t('masterMachines') },
            { href: '/master/machines/qr',  label: 'QR Code' },
            { href: '/master/parts',        label: t('masterParts') },
            { href: '/master/problems',     label: t('masterProblems') },
            { href: '/master/departments',  label: t('masterDepartments') },
          ],
        },
      ],
    },
    {
      key: 'admin',
      items: [
        {
          label: t('admin'),
          icon: <Users size={18} />,
          roles: ['ADMIN', 'MANAGER'],
          children: [
            { href: '/admin/users',         label: t('adminUsers') },
            { href: '/admin/holidays',      label: t('adminHolidays') },
            { href: '/admin/notifications', label: t('adminNotifications') },
          ],
        },
      ],
    },
  ]

  return (
    <aside
      id={id}
      className={cn('flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white', className)}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Factory size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Production</p>
          <p className="text-xs text-slate-500">Tracker</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navGroups.map(group =>
          group.items.map((item, idx) => {
            if (item.roles && userRole && !item.roles.includes(userRole)) return null

            if (item.href) {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('sidebar-item', isActive && 'active')}
                  onClick={() => onNavigate?.()}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            }

            // Group with children
            const groupKey = `${group.key}-${idx}`
            const isOpen = openGroups.includes(groupKey)
            const isChildActive = item.children?.some(c => pathname.startsWith(c.href))

            return (
              <div key={groupKey}>
                <button
                  onClick={() => toggle(groupKey)}
                  className={cn(
                    'sidebar-item w-full justify-between',
                    isChildActive && !isOpen && 'text-blue-700 bg-blue-50'
                  )}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    {item.label}
                  </span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && item.children && (
                  <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                    {item.children.map(child => {
                      const isActive = pathname.startsWith(child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-sm text-slate-600 hover:text-blue-700',
                            isActive && 'font-medium text-blue-700'
                          )}
                          onClick={() => onNavigate?.()}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </nav>
    </aside>
  )
}
