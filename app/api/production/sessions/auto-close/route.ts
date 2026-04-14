import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveAutoCloseWindow } from '@/lib/production/session-auto-close'
import { logError, logInfo } from '@/lib/logging/app-log'
import { auth } from '@/lib/auth'
import { isValidCronRequest } from '@/lib/cron-auth'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { getIdempotentReplay, setIdempotentSuccess } from '@/lib/server/idempotency-memory'

const IDEMPOTENCY_NS = 'production.sessions.auto-close'

async function authorizeAutoClose(req: NextRequest): Promise<NextResponse | null> {
  if (isValidCronRequest(req)) return null
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const allowed = await checkPermissionForSession(session, 'api.production.sessions.auto-close', {
    apiPath: req.nextUrl.pathname,
  })
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

type JobResult = { status: number; body: Record<string, unknown> }

async function runAutoCloseJob(): Promise<JobResult> {
  const now = new Date()
  const window = resolveAutoCloseWindow(now.getTime())

  if (window.mode === 'idle') {
    await logInfo({
      source: 'production.sessions.auto-close',
      category: 'auto-close',
      message: 'Auto-close skipped outside window',
      details: { reason: window.reason, now: { hour: window.nowHour, minute: window.nowMinute } },
    })
    return {
      status: 200,
      body: {
        mode: window.mode,
        reason: window.reason,
        now: { hour: window.nowHour, minute: window.nowMinute },
        message: 'Outside auto-close window',
      },
    }
  }

  const where = {
    status: 'IN_PROGRESS' as const,
    shiftType: window.shiftType,
    sessionDate: { in: window.mode === 'hard_close' ? window.sessionDates : [new Date()] },
  }

  if (window.mode === 'soft_checkpoint') {
    const openCount = await prisma.productionSession.count({
      where: {
        status: 'IN_PROGRESS',
        shiftType: window.shiftType,
      },
    })
    await logInfo({
      source: 'production.sessions.auto-close',
      category: 'auto-close',
      message: 'Soft checkpoint evaluated',
      details: { reason: window.reason, shiftType: window.shiftType, openInProgressSessions: openCount },
    })
    return {
      status: 200,
      body: {
        mode: window.mode,
        reason: window.reason,
        shiftType: window.shiftType,
        openInProgressSessions: openCount,
        message: 'Soft checkpoint only (no status update)',
      },
    }
  }

  const candidates = await prisma.productionSession.findMany({
    where,
    select: {
      id: true,
      lineId: true,
      shiftType: true,
      sessionDate: true,
      otHours: true,
      totalHours: true,
      line: { select: { lineCode: true } },
    },
  })

  let completedCount = 0
  for (const row of candidates) {
    const updated = await prisma.productionSession.updateMany({
      where: { id: row.id, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', endTime: now },
    })
    if (updated.count < 1) continue
    completedCount++
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'AUTO_COMPLETE_SESSION',
        entity: 'production_sessions',
        entityId: row.id,
        details: {
          reason: window.reason,
          lineId: row.lineId,
          lineCode: row.line?.lineCode ?? null,
          shiftType: row.shiftType,
          sessionDate: row.sessionDate,
          otHours: row.otHours,
          totalHours: row.totalHours,
          closedAt: now.toISOString(),
        },
      },
    })
  }

  return {
    status: 200,
    body: {
      mode: window.mode,
      reason: window.reason,
      shiftType: window.shiftType,
      sessionDateKeys: window.sessionDateKeys,
      scanned: candidates.length,
      completed: completedCount,
      skipped: candidates.length - completedCount,
    },
  }
}

export async function POST(req: NextRequest) {
  const denied = await authorizeAutoClose(req)
  if (denied) return denied

  const rawKey = req.headers.get('idempotency-key')?.trim() ?? ''
  const idemKey = rawKey.length > 256 ? rawKey.slice(0, 256) : rawKey

  if (idemKey) {
    const replay = getIdempotentReplay(IDEMPOTENCY_NS, idemKey)
    if (replay) {
      return NextResponse.json(replay.body, {
        status: replay.status,
        headers: { 'X-Idempotent-Replayed': 'true' },
      })
    }
  }

  try {
    const result = await runAutoCloseJob()
    if (idemKey && result.status >= 200 && result.status < 300) {
      setIdempotentSuccess(IDEMPOTENCY_NS, idemKey, result.status, result.body)
    }
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('[Session Auto-Close Error]', err)
    await logError({
      source: 'production.sessions.auto-close',
      category: 'auto-close',
      message: 'Auto-close job failed',
      details: {
        error: err instanceof Error ? err.message : String(err),
      },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export function GET() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message:
        'Use POST /api/production/sessions/auto-close with Authorization: Bearer <CRON_SECRET>, HMAC + IP allowlist, or an authenticated session with api.production.sessions.auto-close. Optional header: Idempotency-Key.',
    },
    { status: 405, headers: { Allow: 'POST, OPTIONS' } },
  )
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: 'POST, OPTIONS' },
  })
}
