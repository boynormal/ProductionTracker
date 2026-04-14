import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createPermissionAuditLog, requirePermissionAdmin } from '@/lib/permissions/admin'

const payloadSchema = z.object({
  auditLogId: z.string().min(1),
})

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export async function POST(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  const parsed = payloadSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const audit = await prisma.auditLog.findUnique({ where: { id: parsed.data.auditLogId } })
  if (!audit) return NextResponse.json({ error: 'Audit log not found' }, { status: 404 })
  const details = asRecord(audit.details)
  if (!details) return NextResponse.json({ error: 'Audit details are not rollback-safe' }, { status: 400 })

  const kind = String(details.kind ?? '')
  if (kind === 'role_matrix_update') {
    const role = String(details.role ?? '')
    const before = asArray(details.before)
    if (!role) return NextResponse.json({ error: 'Invalid role snapshot' }, { status: 400 })

    const permissions = await prisma.permission.findMany({
      where: { key: { in: before.map((x) => String(asRecord(x)?.permissionKey ?? '')) } },
      select: { id: true, key: true },
    })
    const idByKey = new Map(permissions.map((p) => [p.key, p.id]))

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role: role as never } })
      for (const row of before) {
        const rec = asRecord(row)
        if (!rec) continue
        const permissionKey = String(rec.permissionKey ?? '')
        const effect = String(rec.effect ?? '')
        const permissionId = idByKey.get(permissionKey)
        if (!permissionId || (effect !== 'ALLOW' && effect !== 'DENY')) continue
        await tx.rolePermission.create({
          data: {
            role: role as never,
            permissionId,
            effect: effect as never,
            createdById: gate.session.user.id,
          },
        })
      }
    })

    await createPermissionAuditLog({
      actorUserId: gate.session.user.id,
      action: 'PERMISSION_ROLLBACK',
      entity: 'role_permissions',
      entityId: role,
      details: { sourceAuditLogId: audit.id, rollbackKind: kind },
    })

    return NextResponse.json({ data: { rolledBack: true, kind } })
  }

  if (kind === 'scope_create' || kind === 'scope_update' || kind === 'scope_delete') {
    const before = asRecord(details.before)
    const after = asRecord(details.after)
    const target = before ?? after
    const targetId = String(target?.id ?? '')
    if (!targetId) return NextResponse.json({ error: 'Scope snapshot invalid' }, { status: 400 })

    if (before) {
      await prisma.permissionScope.upsert({
        where: { id: targetId },
        update: {
          permissionId: String(before.permissionId ?? ''),
          targetRole: (before.targetRole as never) ?? null,
          targetUserId: (before.targetUserId as string | null) ?? null,
          scopeType: before.scopeType as never,
          scopeValue: (before.scopeValue as string | null) ?? null,
          shiftType: (before.shiftType as never) ?? null,
          effect: before.effect as never,
          expiresAt: before.expiresAt ? new Date(String(before.expiresAt)) : null,
          createdById: gate.session.user.id,
        },
        create: {
          id: targetId,
          permissionId: String(before.permissionId ?? ''),
          targetRole: (before.targetRole as never) ?? null,
          targetUserId: (before.targetUserId as string | null) ?? null,
          scopeType: before.scopeType as never,
          scopeValue: (before.scopeValue as string | null) ?? null,
          shiftType: (before.shiftType as never) ?? null,
          effect: before.effect as never,
          expiresAt: before.expiresAt ? new Date(String(before.expiresAt)) : null,
          createdById: gate.session.user.id,
        },
      })
    } else {
      await prisma.permissionScope.deleteMany({ where: { id: targetId } })
    }

    await createPermissionAuditLog({
      actorUserId: gate.session.user.id,
      action: 'PERMISSION_ROLLBACK',
      entity: 'permission_scopes',
      entityId: targetId,
      details: { sourceAuditLogId: audit.id, rollbackKind: kind },
    })
    return NextResponse.json({ data: { rolledBack: true, kind } })
  }

  if (kind === 'exception_create' || kind === 'exception_update' || kind === 'exception_delete') {
    const before = asRecord(details.before)
    const after = asRecord(details.after)
    const target = before ?? after
    const targetId = String(target?.id ?? '')
    if (!targetId) return NextResponse.json({ error: 'Exception snapshot invalid' }, { status: 400 })

    if (before) {
      await prisma.userPermissionOverride.upsert({
        where: { id: targetId },
        update: {
          userId: String(before.userId ?? ''),
          permissionId: String(before.permissionId ?? ''),
          effect: before.effect as never,
          scopeType: before.scopeType as never,
          scopeValue: (before.scopeValue as string | null) ?? null,
          shiftType: (before.shiftType as never) ?? null,
          reason: (before.reason as string | null) ?? null,
          expiresAt: before.expiresAt ? new Date(String(before.expiresAt)) : null,
          createdById: gate.session.user.id,
        },
        create: {
          id: targetId,
          userId: String(before.userId ?? ''),
          permissionId: String(before.permissionId ?? ''),
          effect: before.effect as never,
          scopeType: before.scopeType as never,
          scopeValue: (before.scopeValue as string | null) ?? null,
          shiftType: (before.shiftType as never) ?? null,
          reason: (before.reason as string | null) ?? null,
          expiresAt: before.expiresAt ? new Date(String(before.expiresAt)) : null,
          createdById: gate.session.user.id,
        },
      })
    } else {
      await prisma.userPermissionOverride.deleteMany({ where: { id: targetId } })
    }

    await createPermissionAuditLog({
      actorUserId: gate.session.user.id,
      action: 'PERMISSION_ROLLBACK',
      entity: 'user_permission_overrides',
      entityId: targetId,
      details: { sourceAuditLogId: audit.id, rollbackKind: kind },
    })
    return NextResponse.json({ data: { rolledBack: true, kind } })
  }

  return NextResponse.json({ error: `Rollback for "${kind}" is not supported` }, { status: 400 })
}

