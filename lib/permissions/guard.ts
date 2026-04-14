import type { PermissionScope, UserPermissionOverride, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { MENU_PERMISSION_KEYS, PERMISSION_CATALOG, PERMISSION_CATALOG_BY_KEY } from '@/lib/permissions/catalog'
import { scopeMatches, type PermissionCheckContext } from '@/lib/permissions/scope-match'

type ScopeLike = Pick<PermissionScope, 'scopeType' | 'scopeValue' | 'effect' | 'shiftType'>
type OverrideLike = Pick<UserPermissionOverride, 'scopeType' | 'scopeValue' | 'effect' | 'shiftType'>

function now() {
  return new Date()
}

function matchShift<T extends { shiftType: string | null }>(row: T, context: PermissionCheckContext): boolean {
  if (!row.shiftType) return true
  return row.shiftType === (context.shiftType ?? null)
}

function evaluateScopedEffects<T extends ScopeLike | OverrideLike>(
  rows: T[],
  context: PermissionCheckContext,
): {
  denyMatched: boolean
  allowMatched: boolean
  hasAllowRows: boolean
} {
  let denyMatched = false
  let allowMatched = false
  let hasAllowRows = false

  for (const row of rows) {
    if (row.effect === 'ALLOW') hasAllowRows = true
    if (!matchShift(row, context)) continue
    const matched = scopeMatches(row.scopeType, row.scopeValue, context)
    if (!matched) continue
    if (row.effect === 'DENY') denyMatched = true
    if (row.effect === 'ALLOW') allowMatched = true
  }

  return { denyMatched, allowMatched, hasAllowRows }
}

function defaultRoleAllow(permissionKey: string, role: string): boolean {
  const catalog = PERMISSION_CATALOG_BY_KEY.get(permissionKey)
  if (!catalog?.defaultRoles) return false
  return catalog.defaultRoles.includes(role as UserRole)
}

export async function ensurePermissionCatalogSynced(): Promise<void> {
  await prisma.$transaction(
    PERMISSION_CATALOG.map((item) =>
      prisma.permission.upsert({
        where: { key: item.key },
        update: {
          name: item.name,
          description: item.description,
          resource: item.resource,
          action: item.action,
          isActive: true,
        },
        create: {
          key: item.key,
          name: item.name,
          description: item.description,
          resource: item.resource,
          action: item.action,
          isActive: true,
        },
      }),
    ),
  )
}

type CheckPermissionArgs = {
  userId: string
  role: string
  permissionKey: string
  context?: PermissionCheckContext
}

export async function checkPermission(args: CheckPermissionArgs): Promise<boolean> {
  const context = args.context ?? {}
  const current = now()

  const permission = await prisma.permission.findUnique({
    where: { key: args.permissionKey },
    select: { id: true, key: true, isActive: true },
  })
  if (!permission || !permission.isActive) return defaultRoleAllow(args.permissionKey, args.role)

  const [overrides, userScopes, rolePermission, roleScopes] = await Promise.all([
    prisma.userPermissionOverride.findMany({
      where: {
        userId: args.userId,
        permissionId: permission.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: current } }],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.permissionScope.findMany({
      where: {
        permissionId: permission.id,
        targetUserId: args.userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: current } }],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role: args.role as UserRole,
          permissionId: permission.id,
        },
      },
    }),
    prisma.permissionScope.findMany({
      where: {
        permissionId: permission.id,
        targetRole: args.role as UserRole,
        OR: [{ expiresAt: null }, { expiresAt: { gt: current } }],
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const overrideDecision = evaluateScopedEffects(overrides, context)
  if (overrideDecision.denyMatched) return false
  if (overrideDecision.allowMatched) return true

  const userScopeDecision = evaluateScopedEffects(userScopes, context)
  if (userScopeDecision.denyMatched) return false
  if (userScopeDecision.allowMatched) return true
  if (userScopeDecision.hasAllowRows && !userScopeDecision.allowMatched) return false

  if (rolePermission?.effect === 'DENY') return false

  const roleScopeDecision = evaluateScopedEffects(roleScopes, context)
  if (roleScopeDecision.denyMatched) return false
  if (roleScopeDecision.allowMatched) return true
  if (roleScopeDecision.hasAllowRows && !roleScopeDecision.allowMatched) return false

  if (rolePermission?.effect === 'ALLOW') return true
  return defaultRoleAllow(args.permissionKey, args.role)
}

export async function checkPermissionForSession(
  session: { user?: { id?: string; role?: string } | null },
  permissionKey: string,
  context?: PermissionCheckContext,
): Promise<boolean> {
  const userId = session.user?.id
  const role = session.user?.role
  if (!userId || !role) return false
  return checkPermission({
    userId,
    role,
    permissionKey,
    context,
  })
}

export async function getAllowedMenuKeysForUser(userId: string, role: string): Promise<string[]> {
  const allowed = await Promise.all(
    MENU_PERMISSION_KEYS.map(async (key) => {
      const isAllowed = await checkPermission({ userId, role, permissionKey: key, context: { menuPath: PERMISSION_CATALOG_BY_KEY.get(key)?.path } })
      return isAllowed ? key : null
    }),
  )
  return allowed.filter((x): x is string => Boolean(x))
}

