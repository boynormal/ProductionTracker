import { PrismaClient, PermissionEffect, PermissionScopeType } from '@prisma/client'
import { PERMISSION_CATALOG } from '../lib/permissions/catalog'

function assertTrue(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERT_TRUE failed: ${message}`)
}

function assertFalse(condition: boolean, message: string) {
  if (condition) throw new Error(`ASSERT_FALSE failed: ${message}`)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    for (const item of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { key: item.key },
        update: { name: item.name, description: item.description, resource: item.resource, action: item.action, isActive: true },
        create: { key: item.key, name: item.name, description: item.description, resource: item.resource, action: item.action, isActive: true },
      })
    }

    const permission = await prisma.permission.findUnique({ where: { key: 'menu.admin.permissions' } })
    if (!permission) throw new Error('permission menu.admin.permissions not found')

    const operator = await prisma.user.findFirst({
      where: { role: 'OPERATOR', isActive: true },
      select: { id: true, role: true },
    })
    if (!operator) throw new Error('active OPERATOR user not found')

    const line = await prisma.line.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    if (!line) throw new Error('active line not found')

    await prisma.rolePermission.upsert({
      where: { role_permissionId: { role: 'OPERATOR', permissionId: permission.id } },
      update: { effect: PermissionEffect.ALLOW },
      create: { role: 'OPERATOR', permissionId: permission.id, effect: PermissionEffect.ALLOW },
    })

    const baseAllowed = await checkPermissionDirect(prisma, {
      userId: operator.id,
      role: operator.role,
      permissionKey: permission.key,
      context: { menuPath: '/admin/permissions' },
    })
    assertTrue(baseAllowed, 'role allow should grant access')

    const denyOverride = await prisma.userPermissionOverride.create({
      data: {
        userId: operator.id,
        permissionId: permission.id,
        effect: PermissionEffect.DENY,
        scopeType: PermissionScopeType.GLOBAL,
      },
    })
    const denied = await checkPermissionDirect(prisma, {
      userId: operator.id,
      role: operator.role,
      permissionKey: permission.key,
      context: { menuPath: '/admin/permissions' },
    })
    assertFalse(denied, 'deny override must win over role allow')
    await prisma.userPermissionOverride.delete({ where: { id: denyOverride.id } })

    await prisma.rolePermission.delete({
      where: { role_permissionId: { role: 'OPERATOR', permissionId: permission.id } },
    })
    const scopedAllow = await prisma.permissionScope.create({
      data: {
        permissionId: permission.id,
        targetRole: 'OPERATOR',
        scopeType: PermissionScopeType.LINE,
        scopeValue: line.id,
        effect: PermissionEffect.ALLOW,
      },
    })

    const inScope = await checkPermissionDirect(prisma, {
      userId: operator.id,
      role: operator.role,
      permissionKey: permission.key,
      context: { lineId: line.id, menuPath: '/admin/permissions' },
    })
    assertTrue(inScope, 'matching scoped allow should grant access')

    const outScope = await checkPermissionDirect(prisma, {
      userId: operator.id,
      role: operator.role,
      permissionKey: permission.key,
      context: { lineId: 'line-outside', menuPath: '/admin/permissions' },
    })
    assertFalse(outScope, 'non-matching scoped allow should not grant access')

    const expiredOverride = await prisma.userPermissionOverride.create({
      data: {
        userId: operator.id,
        permissionId: permission.id,
        effect: PermissionEffect.ALLOW,
        scopeType: PermissionScopeType.GLOBAL,
        expiresAt: new Date(Date.now() - 60_000),
      },
    })
    const afterExpired = await checkPermissionDirect(prisma, {
      userId: operator.id,
      role: operator.role,
      permissionKey: permission.key,
      context: { lineId: 'line-outside', menuPath: '/admin/permissions' },
    })
    assertFalse(afterExpired, 'expired override should be ignored')

    await prisma.userPermissionOverride.delete({ where: { id: expiredOverride.id } })
    await prisma.permissionScope.delete({ where: { id: scopedAllow.id } })

    console.log('✅ Permission verification passed')
  } finally {
    await prisma.$disconnect()
  }
}

async function checkPermissionDirect(
  prisma: PrismaClient,
  args: {
    userId: string
    role: string
    permissionKey: string
    context: { lineId?: string; menuPath?: string }
  },
): Promise<boolean> {
  const permission = await prisma.permission.findUnique({ where: { key: args.permissionKey } })
  if (!permission || !permission.isActive) return false

  const now = new Date()
  const [overrides, rolePermission, roleScopes] = await Promise.all([
    prisma.userPermissionOverride.findMany({
      where: {
        userId: args.userId,
        permissionId: permission.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.rolePermission.findUnique({
      where: { role_permissionId: { role: args.role as any, permissionId: permission.id } },
    }),
    prisma.permissionScope.findMany({
      where: {
        permissionId: permission.id,
        targetRole: args.role as any,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
  ])

  for (const row of overrides) {
    if (row.effect === 'DENY') return false
    if (row.effect === 'ALLOW') return true
  }

  const scopedAllows = roleScopes.filter((s) => s.effect === 'ALLOW')
  const matchedScopedAllow = scopedAllows.some((s) => {
    if (s.scopeType === PermissionScopeType.LINE) return s.scopeValue === args.context.lineId
    if (s.scopeType === PermissionScopeType.MENU) {
      const p = args.context.menuPath ?? ''
      const v = s.scopeValue ?? ''
      return p === v || p.startsWith(`${v}/`)
    }
    if (s.scopeType === PermissionScopeType.GLOBAL) return true
    return false
  })
  if (matchedScopedAllow) return true
  if (scopedAllows.length > 0) return false

  return rolePermission?.effect === 'ALLOW'
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

