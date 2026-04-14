'use client'

import { useMemo, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Settings2,
  Bell,
  Factory,
  Users,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export type DashboardNavChild = { href: string; label: string }

export type DashboardNavItem =
  | {
      kind: 'link'
      href: string
      label: string
      icon: ReactNode
    }
  | {
      kind: 'group'
      key: string
      label: string
      icon: ReactNode
      children: DashboardNavChild[]
      roles?: string[]
    }

export function useDashboardNav(): { items: DashboardNavItem[] } {
  const { t } = useI18n()

  return useMemo(
    () => ({
      items: [
        {
          kind: 'link',
          href: '/',
          label: t('dashboard'),
          icon: <LayoutDashboard size={20} />,
        },
        {
          kind: 'link',
          href: '/alerts',
          label: t('navAlerts'),
          icon: <Bell size={20} />,
        },
        {
          kind: 'group',
          key: 'production',
          label: t('production'),
          icon: <Factory size={20} />,
          children: [
            { href: '/production/record', label: t('productionRecord') },
            { href: '/production/history', label: t('productionHistory') },
            { href: '/production/report', label: t('productionReport') },
            { href: '/production/mtbf', label: 'MTBF/MTTR' },
          ],
        },
        {
          kind: 'group',
          key: 'master',
          label: t('master'),
          icon: <Settings2 size={20} />,
          children: [
            { href: '/master/lines', label: t('masterLines') },
            { href: '/master/machines', label: t('masterMachines') },
            { href: '/master/machines/qr', label: 'QR Code' },
            { href: '/master/parts', label: t('masterParts') },
            { href: '/master/problems', label: t('masterProblems') },
            { href: '/master/departments', label: t('masterDepartments') },
          ],
        },
        {
          kind: 'group',
          key: 'admin',
          label: t('admin'),
          icon: <Users size={20} />,
          roles: ['ADMIN', 'MANAGER'],
          children: [
            { href: '/admin/users', label: t('adminUsers') },
            { href: '/admin/holidays', label: t('adminHolidays') },
            { href: '/admin/notifications', label: t('adminNotifications') },
          ],
        },
      ],
    }),
    [t],
  )
}
