import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function requirePermissionAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  // Re-check DB — stale JWT may still claim ADMIN after deactivate/demotion.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (dbUser.role !== 'ADMIN') {
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

