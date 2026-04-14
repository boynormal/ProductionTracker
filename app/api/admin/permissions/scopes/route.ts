import { NextRequest, NextResponse } from 'next/server'
import { PermissionEffect, PermissionScopeType, ShiftType, UserRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { createPermissionAuditLog, requirePermissionAdmin } from '@/lib/permissions/admin'

const upsertSchema = z.object({
  id: z.string().optional(),
  permissionKey: z.string().min(1),
  targetRole: z.nativeEnum(UserRole).nullable().optional(),
  targetUserId: z.string().nullable().optional(),
  scopeType: z.nativeEnum(PermissionScopeType),
  scopeValue: z.string().nullable().optional(),
  shiftType: z.nativeEnum(ShiftType).nullable().optional(),
  effect: z.nativeEnum(PermissionEffect).default(PermissionEffect.ALLOW),
  expiresAt: z.string().datetime().nullable().optional(),
})

const updateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('upsert'), scope: upsertSchema }),
  z.object({ mode: z.literal('delete'), id: z.string().min(1) }),
])

export async function GET(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()

  const { searchParams } = new URL(req.url)
  const targetRole = searchParams.get('targetRole') as UserRole | null
  const targetUserId = searchParams.get('targetUserId')

  const rows = await prisma.permissionScope.findMany({
    where: {
      ...(targetRole ? { targetRole } : {}),
      ...(targetUserId ? { targetUserId } : {}),
    },
    include: {
      permission: { select: { key: true, name: true } },
      targetUser: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  })

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      permissionKey: r.permission.key,
      permissionName: r.permission.name,
      targetRole: r.targetRole,
      targetUser: r.targetUser,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      shiftType: r.shiftType,
      effect: r.effect,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()

  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.mode === 'delete') {
    const existing = await prisma.permissionScope.findUnique({ where: { id: parsed.data.id } })
    if (!existing) return NextResponse.json({ error: 'Scope not found' }, { status: 404 })
    await prisma.permissionScope.delete({ where: { id: parsed.data.id } })
    await createPermissionAuditLog({
      actorUserId: gate.session.user.id,
      action: 'PERMISSION_SCOPE_DELETE',
      entity: 'permission_scopes',
      entityId: parsed.data.id,
      details: { kind: 'scope_delete', before: existing },
    })
    return NextResponse.json({ data: { id: parsed.data.id, deleted: true } })
  }

  const scope = parsed.data.scope
  if (!scope.targetRole && !scope.targetUserId) {
    return NextResponse.json({ error: 'targetRole or targetUserId is required' }, { status: 400 })
  }
  if (scope.targetRole && scope.targetUserId) {
    return NextResponse.json({ error: 'targetRole and targetUserId cannot both be set' }, { status: 400 })
  }

  const permission = await prisma.permission.findUnique({ where: { key: scope.permissionKey }, select: { id: true } })
  if (!permission) return NextResponse.json({ error: 'Permission not found' }, { status: 404 })

  const before = scope.id ? await prisma.permissionScope.findUnique({ where: { id: scope.id } }) : null
  const saved = scope.id
    ? await prisma.permissionScope.update({
        where: { id: scope.id },
        data: {
          permissionId: permission.id,
          targetRole: scope.targetRole ?? null,
          targetUserId: scope.targetUserId ?? null,
          scopeType: scope.scopeType,
          scopeValue: scope.scopeValue ?? null,
          shiftType: scope.shiftType ?? null,
          effect: scope.effect,
          expiresAt: scope.expiresAt ? new Date(scope.expiresAt) : null,
          createdById: gate.session.user.id,
        },
      })
    : await prisma.permissionScope.create({
        data: {
          permissionId: permission.id,
          targetRole: scope.targetRole ?? null,
          targetUserId: scope.targetUserId ?? null,
          scopeType: scope.scopeType,
          scopeValue: scope.scopeValue ?? null,
          shiftType: scope.shiftType ?? null,
          effect: scope.effect,
          expiresAt: scope.expiresAt ? new Date(scope.expiresAt) : null,
          createdById: gate.session.user.id,
        },
      })

  await createPermissionAuditLog({
    actorUserId: gate.session.user.id,
    action: scope.id ? 'PERMISSION_SCOPE_UPDATE' : 'PERMISSION_SCOPE_CREATE',
    entity: 'permission_scopes',
    entityId: saved.id,
    details: {
      kind: scope.id ? 'scope_update' : 'scope_create',
      before,
      after: saved,
    },
  })

  return NextResponse.json({ data: saved })
}

