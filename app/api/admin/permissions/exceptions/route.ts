import { NextRequest, NextResponse } from 'next/server'
import { PermissionEffect, PermissionScopeType, ShiftType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { createPermissionAuditLog, requirePermissionAdmin } from '@/lib/permissions/admin'

const upsertSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  permissionKey: z.string().min(1),
  effect: z.nativeEnum(PermissionEffect),
  scopeType: z.nativeEnum(PermissionScopeType).default(PermissionScopeType.GLOBAL),
  scopeValue: z.string().nullable().optional(),
  shiftType: z.nativeEnum(ShiftType).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

const updateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('upsert'), exception: upsertSchema }),
  z.object({ mode: z.literal('delete'), id: z.string().min(1) }),
])

export async function GET(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const rows = await prisma.userPermissionOverride.findMany({
    where: { ...(userId ? { userId } : {}) },
    include: {
      permission: { select: { key: true, name: true } },
      user: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  })

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      user: r.user,
      permissionKey: r.permission.key,
      permissionName: r.permission.name,
      effect: r.effect,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      shiftType: r.shiftType,
      reason: r.reason,
      expiresAt: r.expiresAt,
      createdBy: r.createdBy,
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
    const existing = await prisma.userPermissionOverride.findUnique({ where: { id: parsed.data.id } })
    if (!existing) return NextResponse.json({ error: 'Exception not found' }, { status: 404 })
    await prisma.userPermissionOverride.delete({ where: { id: parsed.data.id } })
    await createPermissionAuditLog({
      actorUserId: gate.session.user.id,
      action: 'PERMISSION_EXCEPTION_DELETE',
      entity: 'user_permission_overrides',
      entityId: parsed.data.id,
      details: { kind: 'exception_delete', before: existing },
    })
    return NextResponse.json({ data: { id: parsed.data.id, deleted: true } })
  }

  const exception = parsed.data.exception
  const permission = await prisma.permission.findUnique({ where: { key: exception.permissionKey }, select: { id: true } })
  if (!permission) return NextResponse.json({ error: 'Permission not found' }, { status: 404 })

  const before = exception.id ? await prisma.userPermissionOverride.findUnique({ where: { id: exception.id } }) : null
  const saved = exception.id
    ? await prisma.userPermissionOverride.update({
        where: { id: exception.id },
        data: {
          userId: exception.userId,
          permissionId: permission.id,
          effect: exception.effect,
          scopeType: exception.scopeType,
          scopeValue: exception.scopeValue ?? null,
          shiftType: exception.shiftType ?? null,
          reason: exception.reason ?? null,
          expiresAt: exception.expiresAt ? new Date(exception.expiresAt) : null,
          createdById: gate.session.user.id,
        },
      })
    : await prisma.userPermissionOverride.create({
        data: {
          userId: exception.userId,
          permissionId: permission.id,
          effect: exception.effect,
          scopeType: exception.scopeType,
          scopeValue: exception.scopeValue ?? null,
          shiftType: exception.shiftType ?? null,
          reason: exception.reason ?? null,
          expiresAt: exception.expiresAt ? new Date(exception.expiresAt) : null,
          createdById: gate.session.user.id,
        },
      })

  await createPermissionAuditLog({
    actorUserId: gate.session.user.id,
    action: exception.id ? 'PERMISSION_EXCEPTION_UPDATE' : 'PERMISSION_EXCEPTION_CREATE',
    entity: 'user_permission_overrides',
    entityId: saved.id,
    details: {
      kind: exception.id ? 'exception_update' : 'exception_create',
      before,
      after: saved,
    },
  })

  return NextResponse.json({ data: saved })
}

