import { redirect } from 'next/navigation'
import { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { PermissionsClient } from './PermissionsClient'

export default async function AdminPermissionsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') redirect('/')

  await ensurePermissionCatalogSynced()

  const [permissions, rolePermissions, scopes, exceptions, users, audits] = await Promise.all([
    prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }, { key: 'asc' }],
    }),
    prisma.rolePermission.findMany({
      include: { permission: { select: { key: true } } },
    }),
    prisma.permissionScope.findMany({
      include: {
        permission: { select: { key: true, name: true } },
        targetUser: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.userPermissionOverride.findMany({
      include: {
        permission: { select: { key: true, name: true } },
        user: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, role: true },
      orderBy: { employeeCode: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [{ action: { startsWith: 'PERMISSION_' } }, { entity: { in: ['role_permissions', 'permission_scopes', 'user_permission_overrides'] } }],
      },
      include: { user: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const matrix: Record<string, Record<string, 'ALLOW' | 'DENY' | null>> = {}
  for (const role of Object.values(UserRole)) matrix[role] = {}
  for (const row of rolePermissions) matrix[row.role][row.permission.key] = row.effect

  return (
    <PermissionsClient
      roles={Object.values(UserRole)}
      permissions={JSON.parse(JSON.stringify(permissions))}
      matrix={matrix}
      scopes={JSON.parse(JSON.stringify(scopes))}
      exceptions={JSON.parse(JSON.stringify(exceptions))}
      users={JSON.parse(JSON.stringify(users))}
      audits={JSON.parse(JSON.stringify(audits))}
    />
  )
}

