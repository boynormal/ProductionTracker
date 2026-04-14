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

function mapNotificationSeverity(type: string): 'INFO' | 'WARN' | 'ERROR' {
  if (type === 'MISSING_RECORD' || type === 'LOW_PRODUCTION') return 'WARN'
  if (type === 'HIGH_NG' || type === 'LONG_BREAKDOWN') return 'ERROR'
  return 'INFO'
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canRead = await checkPermissionForSession(session, 'api.admin.logs.notifications.read', { apiPath: req.nextUrl.pathname })
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = parseDateOrNull(searchParams.get('from'))
  const to = parseDateOrNull(searchParams.get('to'))
  const rangeDays = resolveRangeDays(searchParams.get('range') ?? searchParams.get('rangePreset'))
  const type = searchParams.get('type')?.trim() || ''
  const sentVia = searchParams.get('sentVia')?.trim() || ''
  const q = searchParams.get('q')?.trim() || ''
  const exportMode = searchParams.get('export')?.trim() || ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)))

  const where: any = {}
  applyDateRange(where, from, to, rangeDays)
  if (type) where.type = type
  if (sentVia) where.sentVia = sentVia
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { message: { contains: q, mode: 'insensitive' } },
      { sessionId: { contains: q, mode: 'insensitive' } },
    ]
  }

  if (exportMode === 'csv') {
    const rows = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })
    const csv = toCsv(
      rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        type: row.type,
        severity: mapNotificationSeverity(row.type),
        title: row.title,
        message: row.message,
        sentVia: row.sentVia ?? '',
        targetRole: row.targetRole ?? '',
        sessionId: row.sessionId ?? '',
      })),
      ['createdAt', 'type', 'severity', 'title', 'message', 'sentVia', 'targetRole', 'sessionId'],
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="notification-logs.csv"',
      },
    })
  }

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ])

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      severity: mapNotificationSeverity(row.type),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

