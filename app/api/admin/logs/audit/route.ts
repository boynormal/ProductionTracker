import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { dayEndExclusiveUTC, getThaiTodayUTC, parseThaiCalendarDateUtc } from '@/lib/time-utils'

function parseDateOrNull(value: string | null): Date | null {
  if (!value) return null
  return parseThaiCalendarDateUtc(value)
}

function resolveRangeDays(raw: string | null): number {
  if (raw === '30' || raw === '30d') return 30
  return 7
}

function applyDateRange(where: Record<string, unknown>, from: Date | null, to: Date | null, rangeDays: number) {
  if (from && to) {
    where.createdAt = { gte: from, lt: dayEndExclusiveUTC(to) }
    return
  }
  if (from) {
    where.createdAt = { gte: from }
    return
  }
  if (to) {
    where.createdAt = { lt: dayEndExclusiveUTC(to) }
    return
  }
  const endExclusive = dayEndExclusiveUTC(getThaiTodayUTC())
  const start = new Date(endExclusive.getTime() - rangeDays * 24 * 60 * 60 * 1000)
  where.createdAt = { gte: start, lt: endExclusive }
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(',')
  const body = rows.map((row) => columns.map((col) => escapeCsvCell(row[col])).join(',')).join('\n')
  return `${header}\n${body}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canRead = await checkPermissionForSession(session, 'api.admin.logs.audit.read', { apiPath: req.nextUrl.pathname })
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = parseDateOrNull(searchParams.get('from'))
  const to = parseDateOrNull(searchParams.get('to'))
  const rangeDays = resolveRangeDays(searchParams.get('range') ?? searchParams.get('rangePreset'))
  const action = searchParams.get('action')?.trim() || ''
  const entity = searchParams.get('entity')?.trim() || ''
  const userId = searchParams.get('userId')?.trim() || ''
  const userQuery = searchParams.get('userQuery')?.trim() || ''
  const q = searchParams.get('q')?.trim() || ''
  const exportMode = searchParams.get('export')?.trim() || ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)))

  const where: any = {}
  applyDateRange(where, from, to, rangeDays)
  if (action) where.action = { contains: action, mode: 'insensitive' }
  if (entity) where.entity = { contains: entity, mode: 'insensitive' }
  if (userId) where.userId = userId
  if (userQuery) {
    where.user = {
      OR: [
        { employeeCode: { contains: userQuery, mode: 'insensitive' } },
        { firstName: { contains: userQuery, mode: 'insensitive' } },
        { lastName: { contains: userQuery, mode: 'insensitive' } },
      ],
    }
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { entity: { contains: q, mode: 'insensitive' } },
      { entityId: { contains: q, mode: 'insensitive' } },
      { user: { employeeCode: { contains: q, mode: 'insensitive' } } },
    ]
  }

  if (exportMode === 'csv') {
    const rows = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const csv = toCsv(
      rows.map((r) => ({
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entity: r.entity ?? '',
        entityId: r.entityId ?? '',
        userEmployeeCode: r.user?.employeeCode ?? '',
        userName: [r.user?.firstName ?? '', r.user?.lastName ?? ''].join(' ').trim(),
        details: r.details,
      })),
      ['createdAt', 'action', 'entity', 'entityId', 'userEmployeeCode', 'userName', 'details'],
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit-logs.csv"',
      },
    })
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
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

