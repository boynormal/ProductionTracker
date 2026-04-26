import type { UserRole } from '@prisma/client'

export type PermissionCategory = 'MENU' | 'API' | 'SYSTEM'

export type PermissionCatalogItem = {
  key: string
  name: string
  description?: string
  resource: string
  action: string
  category: PermissionCategory
  defaultRoles?: UserRole[]
  path?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
}

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { key: 'menu.dashboard', name: 'Dashboard menu', resource: 'menu', action: 'view', category: 'MENU', path: '/', defaultRoles: ['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.alerts', name: 'Alerts menu', resource: 'menu', action: 'view', category: 'MENU', path: '/alerts', defaultRoles: ['SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.production.record', name: 'Production record menu', resource: 'menu', action: 'view', category: 'MENU', path: '/production/record', defaultRoles: ['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.production.history', name: 'Production history menu', resource: 'menu', action: 'view', category: 'MENU', path: '/production/history', defaultRoles: ['SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.production.report', name: 'Production report menu', resource: 'menu', action: 'view', category: 'MENU', path: '/production/report', defaultRoles: ['SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.production.mtbf', name: 'MTBF/MTTR menu', resource: 'menu', action: 'view', category: 'MENU', path: '/production/mtbf', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.master.lines', name: 'Master lines menu', resource: 'menu', action: 'view', category: 'MENU', path: '/master/lines', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.master.machines', name: 'Master machines menu', resource: 'menu', action: 'view', category: 'MENU', path: '/master/machines', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.master.parts', name: 'Master parts menu', resource: 'menu', action: 'view', category: 'MENU', path: '/master/parts', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.master.problems', name: 'Master problems menu', resource: 'menu', action: 'view', category: 'MENU', path: '/master/problems', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'menu.master.departments', name: 'Master organization menu', resource: 'menu', action: 'view', category: 'MENU', path: '/master/departments', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'menu.admin.users', name: 'Admin users menu', resource: 'menu', action: 'view', category: 'MENU', path: '/admin/users', defaultRoles: ['ADMIN'] },
  { key: 'menu.admin.holidays', name: 'Admin holidays menu', resource: 'menu', action: 'view', category: 'MENU', path: '/admin/holidays', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'menu.admin.notifications', name: 'Admin notification records menu', resource: 'menu', action: 'view', category: 'MENU', path: '/admin/notifications', defaultRoles: ['ADMIN'] },
  { key: 'menu.admin.permissions', name: 'Admin permissions menu', resource: 'menu', action: 'view', category: 'MENU', path: '/admin/permissions', defaultRoles: ['ADMIN'] },
  { key: 'menu.admin.logs', name: 'Admin logs menu', resource: 'menu', action: 'view', category: 'MENU', path: '/admin/logs', defaultRoles: ['MANAGER', 'ADMIN'] },

  { key: 'api.admin.users.read', name: 'Read users API', resource: 'admin.users', action: 'read', category: 'API', method: 'GET', path: '/api/admin/users', defaultRoles: ['ADMIN'] },
  { key: 'api.admin.users.write', name: 'Write users API', resource: 'admin.users', action: 'write', category: 'API', method: 'POST', path: '/api/admin/users', defaultRoles: ['ADMIN'] },
  { key: 'api.admin.holidays.read', name: 'Read holidays API', resource: 'admin.holidays', action: 'read', category: 'API', method: 'GET', path: '/api/admin/holidays', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'api.admin.holidays.write', name: 'Write holidays API', resource: 'admin.holidays', action: 'write', category: 'API', method: 'POST', path: '/api/admin/holidays', defaultRoles: ['ADMIN'] },
  { key: 'api.admin.logs.audit.read', name: 'Read audit logs API', resource: 'admin.logs.audit', action: 'read', category: 'API', method: 'GET', path: '/api/admin/logs/audit', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'api.admin.logs.system.read', name: 'Read system logs API', resource: 'admin.logs.system', action: 'read', category: 'API', method: 'GET', path: '/api/admin/logs/system-errors', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'api.admin.logs.notifications.read', name: 'Read notification logs API', resource: 'admin.logs.notifications', action: 'read', category: 'API', method: 'GET', path: '/api/admin/logs/notifications', defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'api.master.write', name: 'Write master data API', resource: 'master', action: 'write', category: 'API', path: '/api/master', defaultRoles: ['ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'api.production.record.write', name: 'Write production records API', resource: 'production.records', action: 'write', category: 'API', method: 'POST', path: '/api/production/records', defaultRoles: ['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  { key: 'api.production.session.write', name: 'Write production sessions API', resource: 'production.sessions', action: 'write', category: 'API', method: 'POST', path: '/api/production/sessions', defaultRoles: ['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] },
  {
    key: 'api.production.sessions.auto-close',
    name: 'Run session auto-close job',
    description: 'POST — cron or manual auto-complete IN_PROGRESS sessions in the close window',
    resource: 'production.sessions',
    action: 'autoClose',
    category: 'API',
    method: 'POST',
    path: '/api/production/sessions/auto-close',
    defaultRoles: ['ADMIN'],
  },

  { key: 'system.permissions.manage', name: 'Manage permission settings', resource: 'system.permissions', action: 'manage', category: 'SYSTEM', defaultRoles: ['ADMIN'] },
]

export const PERMISSION_CATALOG_BY_KEY = new Map(PERMISSION_CATALOG.map((item) => [item.key, item]))

export const MENU_PERMISSION_KEYS = PERMISSION_CATALOG.filter((item) => item.category === 'MENU').map((item) => item.key)
export const API_PERMISSION_KEYS = PERMISSION_CATALOG.filter((item) => item.category === 'API').map((item) => item.key)

