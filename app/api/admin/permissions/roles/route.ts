import { NextRequest, NextResponse } from 'next/server'
import { UserRole, PermissionEffect } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { PERMISSION_CATALOG } from '@/lib/permissions/catalog'
import { ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { createPermissionAuditLog, requirePermissionAdmin } from '@/lib/permissions/admin'

const updateSchema = z.object({
  role: z.nativeEnum(UserRole),
  grants: z.array(
    z.object({
      permissionKey: z.string().min(1),
      enabled: z.boolean().default(true),
      effect: z.nativeEnum(PermissionEffect).default(PermissionEffect.ALLOW),
    }),
  ),
})

export async function GET() {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()

  const [permissions, rolePermissions] = await Promise.all([
    prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }, { key: 'asc' }],
    }),
    prisma.rolePermission.findMany({
      include: { permission: { select: { key: true } } },
    }),
  ])

  const matrix: Record<string, Record<string, PermissionEffect | null>> = {}
  for (const role of Object.values(UserRole)) matrix[role] = {}
  for (const row of rolePermissions) {
    matrix[row.role][row.permission.key] = row.effect
  }

  return NextResponse.json({
    data: {
      roles: Object.values(UserRole),
      permissions: permissions.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        resource: p.resource,
        action: p.action,
        defaultRoles: PERMISSION_CATALOG.find((x) => x.key === p.key)?.defaultRoles ?? [],
      })),
      matrix,
    },
  })
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()

  const json = await req.json()
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { role, grants } = parsed.data
  const permissionRows = await prisma.permission.findMany({
    where: { key: { in: grants.map((g) => g.permissionKey) } },
    select: { id: true, key: true },
  })
  const byKey = new Map(permissionRows.map((p) => [p.key, p.id]))
  const missing = grants.map((g) => g.permissionKey).filter((k) => !byKey.has(k))
  if (missing.length > 0) {
    return NextResponse.json({ error: `Unknown permissions: ${missing.join(', ')}` }, { status: 400 })
  }

  const before = await prisma.rolePermission.findMany({
    where: { role },
    include: { permission: { select: { key: true } } },
  })

  await prisma.$transaction(async (tx) => {
    for (const grant of grants) {
      const permissionId = byKey.get(grant.permissionKey)!
      if (!grant.enabled) {
        await tx.rolePermission.deleteMany({
          where: { role, permissionId },
        })
        continue
      }
      await tx.rolePermission.upsert({
        where: {
          role_permissionId: { role, permissionId },
        },
        update: {
          effect: grant.effect,
          createdById: gate.session.user.id,
        },
        create: {
          role,
          permissionId,
          effect: grant.effect,
          createdById: gate.session.user.id,
        },
      })
    }
  })

  const after = await prisma.rolePermission.findMany({
    where: { role },
    include: { permission: { select: { key: true } } },
  })

  await createPermissionAuditLog({
    actorUserId: gate.session.user.id,
    action: 'PERMISSION_ROLE_MATRIX_UPDATE',
    entity: 'role_permissions',
    entityId: role,
    details: {
      kind: 'role_matrix_update',
      role,
      before: before.map((x) => ({ permissionKey: x.permission.key, effect: x.effect })),
      after: after.map((x) => ({ permissionKey: x.permission.key, effect: x.effect })),
    },
  })

  return NextResponse.json({ data: { role, updated: grants.length } })
}

