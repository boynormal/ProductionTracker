import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermissionAdmin } from '@/lib/permissions/admin'

const PERMISSION_AUDIT_ACTION_PREFIX = 'PERMISSION_'
const PERMISSION_AUDIT_ENTITIES = ['role_permissions', 'permission_scopes', 'user_permission_overrides']

export async function GET(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

  const where = {
    OR: [
      { action: { startsWith: PERMISSION_AUDIT_ACTION_PREFIX } },
      { entity: { in: PERMISSION_AUDIT_ENTITIES } },
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, employeeCode: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

