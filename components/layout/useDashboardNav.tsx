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
export type DashboardNavChildWithPermission = DashboardNavChild & { permissionKey?: string }

export type DashboardNavItem =
  | {
      kind: 'link'
      href: string
      label: string
      icon: ReactNode
      permissionKey?: string
    }
  | {
      kind: 'group'
      key: string
      label: string
      icon: ReactNode
      children: DashboardNavChildWithPermission[]
      roles?: string[]
      permissionKey?: string
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
          permissionKey: 'menu.dashboard',
        },
        {
          kind: 'link',
          href: '/alerts',
          label: t('navAlerts'),
          icon: <Bell size={20} />,
          permissionKey: 'menu.alerts',
        },
        {
          kind: 'group',
          key: 'production',
          label: t('production'),
          icon: <Factory size={20} />,
          children: [
            { href: '/production/record', label: t('productionRecord'), permissionKey: 'menu.production.record' },
            { href: '/production/history', label: t('productionHistory'), permissionKey: 'menu.production.history' },
            { href: '/production/report', label: t('productionReport'), permissionKey: 'menu.production.report' },
            { href: '/production/mtbf', label: 'MTBF/MTTR', permissionKey: 'menu.production.mtbf' },
          ],
        },
        {
          kind: 'group',
          key: 'master',
          label: t('master'),
          icon: <Settings2 size={20} />,
          children: [
            { href: '/master/lines', label: t('masterLines'), permissionKey: 'menu.master.lines' },
            { href: '/master/machines', label: t('masterMachines'), permissionKey: 'menu.master.machines' },
            { href: '/master/machines/qr', label: 'QR Code', permissionKey: 'menu.master.machines' },
            { href: '/master/parts', label: t('masterParts'), permissionKey: 'menu.master.parts' },
            { href: '/master/problems', label: t('masterProblems'), permissionKey: 'menu.master.problems' },
            { href: '/master/departments', label: t('masterDepartments'), permissionKey: 'menu.master.departments' },
          ],
        },
        {
          kind: 'group',
          key: 'admin',
          label: t('admin'),
          icon: <Users size={20} />,
          roles: ['ADMIN', 'MANAGER'],
          children: [
            { href: '/admin/users', label: t('adminUsers'), permissionKey: 'menu.admin.users' },
            { href: '/admin/holidays', label: t('adminHolidays'), permissionKey: 'menu.admin.holidays' },
            { href: '/admin/notifications', label: t('adminNotifications'), permissionKey: 'menu.admin.notifications' },
            { href: '/admin/logs', label: t('adminLogs'), permissionKey: 'menu.admin.logs' },
            { href: '/admin/permissions', label: 'Permissions', permissionKey: 'menu.admin.permissions' },
          ],
        },
      ],
    }),
    [t],
  )
}
