import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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
  const canRead = await checkPermissionForSession(session, 'api.admin.logs.system.read', { apiPath: req.nextUrl.pathname })
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = parseDateOrNull(searchParams.get('from'))
  const to = parseDateOrNull(searchParams.get('to'))
  const rangeDays = resolveRangeDays(searchParams.get('range') ?? searchParams.get('rangePreset'))
  const severity = searchParams.get('severity')?.trim() || ''
  const source = searchParams.get('source')?.trim() || ''
  const method = searchParams.get('method')?.trim() || ''
  const q = searchParams.get('q')?.trim() || ''
  const exportMode = searchParams.get('export')?.trim() || ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`]
  if (from && to) conditions.push(Prisma.sql`sl."createdAt" >= ${from} AND sl."createdAt" < ${dayEndExclusiveUTC(to)}`)
  else if (from) conditions.push(Prisma.sql`sl."createdAt" >= ${from}`)
  else if (to) conditions.push(Prisma.sql`sl."createdAt" < ${dayEndExclusiveUTC(to)}`)
  else {
    const endExclusive = dayEndExclusiveUTC(getThaiTodayUTC())
    const start = new Date(endExclusive.getTime() - rangeDays * 24 * 60 * 60 * 1000)
    conditions.push(Prisma.sql`sl."createdAt" >= ${start} AND sl."createdAt" < ${endExclusive}`)
  }
  if (severity) conditions.push(Prisma.sql`sl."severity" = ${severity}`)
  if (source) conditions.push(Prisma.sql`sl."source" ILIKE ${`%${source}%`}`)
  if (method) conditions.push(Prisma.sql`COALESCE(sl."method", '') = ${method}`)
  if (q) {
    conditions.push(
      Prisma.sql`(sl."message" ILIKE ${`%${q}%`} OR COALESCE(sl."category", '') ILIKE ${`%${q}%`} OR COALESCE(sl."path", '') ILIKE ${`%${q}%`})`,
    )
  }

  const whereSql = Prisma.sql`${Prisma.join(conditions, ' AND ')}`

  if (exportMode === 'csv') {
    const exportRows = await prisma.$queryRaw<
      Array<{
        source: string
        category: string | null
        severity: 'INFO' | 'WARN' | 'ERROR'
        message: string
        details: Prisma.JsonValue | null
        traceId: string | null
        path: string | null
        method: string | null
        createdAt: Date
        userEmployeeCode: string | null
      }>
    >(Prisma.sql`
      SELECT
        sl."source",
        sl."category",
        sl."severity",
        sl."message",
        sl."details",
        sl."traceId",
        sl."path",
        sl."method",
        sl."createdAt",
        u."employeeCode" AS "userEmployeeCode"
      FROM "system_logs" sl
      LEFT JOIN "users" u ON u."id" = sl."userId"
      WHERE ${whereSql}
      ORDER BY sl."createdAt" DESC
      LIMIT 5000
    `)

    const csv = toCsv(
      exportRows.map((r) => ({
        createdAt: r.createdAt.toISOString(),
        severity: r.severity,
        source: r.source,
        category: r.category ?? '',
        method: r.method ?? '',
        path: r.path ?? '',
        userEmployeeCode: r.userEmployeeCode ?? '',
        traceId: r.traceId ?? '',
        message: r.message,
        details: r.details,
      })),
      ['createdAt', 'severity', 'source', 'category', 'method', 'path', 'userEmployeeCode', 'traceId', 'message', 'details'],
    )

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="system-logs.csv"',
      },
    })
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      userId: string | null
      source: string
      category: string | null
      severity: 'INFO' | 'WARN' | 'ERROR'
      message: string
      details: Prisma.JsonValue | null
      traceId: string | null
      path: string | null
      method: string | null
      createdAt: Date
      userEmployeeCode: string | null
      userFirstName: string | null
      userLastName: string | null
    }>
  >(Prisma.sql`
    SELECT
      sl."id",
      sl."userId",
      sl."source",
      sl."category",
      sl."severity",
      sl."message",
      sl."details",
      sl."traceId",
      sl."path",
      sl."method",
      sl."createdAt",
      u."employeeCode" AS "userEmployeeCode",
      u."firstName" AS "userFirstName",
      u."lastName" AS "userLastName"
    FROM "system_logs" sl
    LEFT JOIN "users" u ON u."id" = sl."userId"
    WHERE ${whereSql}
    ORDER BY sl."createdAt" DESC
    OFFSET ${offset}
    LIMIT ${limit}
  `)

  const totalRows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total
    FROM "system_logs" sl
    WHERE ${whereSql}
  `)
  const total = Number(totalRows[0]?.total ?? 0)

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      source: r.source,
      category: r.category,
      severity: r.severity,
      message: r.message,
      details: r.details,
      traceId: r.traceId,
      path: r.path,
      method: r.method,
      createdAt: r.createdAt,
      user: r.userId
        ? {
            id: r.userId,
            employeeCode: r.userEmployeeCode,
            firstName: r.userFirstName,
            lastName: r.userLastName,
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

