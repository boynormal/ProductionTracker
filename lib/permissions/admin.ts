import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function requirePermissionAdmin() {
  const session = await auth()
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.user.role !== 'ADMIN') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, session }
}

export async function createPermissionAuditLog(params: {
  actorUserId: string
  action: string
  entity: string
  entityId?: string | null
  details?: unknown
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.actorUserId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? undefined,
      details: params.details as never,
    },
  })
}

