import { prisma } from '@/lib/prisma'
import {
  type LineTargetMeta,
  calcPerformancePctFromIdealMinutesAndPlannedMinutes,
  computeSessionIdealMinutesForPerformance,
} from '@/lib/utils/oee-cycle-performance'
import { dayEndExclusiveUTC } from '@/lib/time-utils'

function linePartKey(lineId: string, partId: string) {
  return `${lineId}:${partId}`
}

type LineTargetMetaRow = LineTargetMeta & {
  lineId: string
  partId: string
  effectiveDate: Date
}

async function fetchLinePartTargetRowsByPair(
  pairs: Array<{ lineId: string; partId: string }>,
  effectiveDateBefore?: Date,
): Promise<LineTargetMetaRow[]> {
  const unique = new Map<string, { lineId: string; partId: string }>()
  for (const p of pairs) {
    unique.set(linePartKey(p.lineId, p.partId), p)
  }
  const list = [...unique.values()]
  if (list.length === 0) return []

  return prisma.linePartTarget.findMany({
    where: {
      isActive: true,
      ...(effectiveDateBefore ? { effectiveDate: { lt: effectiveDateBefore } } : {}),
      OR: list.map((p) => ({ lineId: p.lineId, partId: p.partId })),
    },
    orderBy: { effectiveDate: 'desc' },
    select: {
      lineId: true,
      partId: true,
      effectiveDate: true,
      cycleTimeMin: true,
      piecesPerHour: true,
    },
  })
}

function buildLinePartTargetMetaByPair(rows: LineTargetMetaRow[]): Map<string, LineTargetMeta> {
  const map = new Map<string, LineTargetMeta>()
  for (const row of rows) {
    const k = linePartKey(row.lineId, row.partId)
    if (!map.has(k)) {
      map.set(k, {
        cycleTimeMin: row.cycleTimeMin,
        piecesPerHour: row.piecesPerHour,
      })
    }
  }
  return map
}

function buildLinePartTargetMetaByPairForDate(
  rows: LineTargetMetaRow[],
  asOfDate: Date,
): Map<string, LineTargetMeta> {
  const effectiveDateBefore = dayEndExclusiveUTC(asOfDate)
  return buildLinePartTargetMetaByPair(
    rows.filter((row) => row.effectiveDate.getTime() < effectiveDateBefore.getTime()),
  )
}

export async function fetchLinePartTargetMetaByPair(
  pairs: Array<{ lineId: string; partId: string }>,
): Promise<Map<string, LineTargetMeta>> {
  return buildLinePartTargetMetaByPair(await fetchLinePartTargetRowsByPair(pairs))
}

export function collectLinePartPairsFromSessions(
  sessions: Array<{ lineId: string; hourlyRecords: Array<{ partId: string }> }>,
): Array<{ lineId: string; partId: string }> {
  const pairs: Array<{ lineId: string; partId: string }> = []
  for (const s of sessions) {
    for (const hr of s.hourlyRecords) {
      pairs.push({ lineId: s.lineId, partId: hr.partId })
    }
  }
  return pairs
}

type SessionShape = {
  lineId: string
  reportingDate?: Date | null
  sessionDate: Date
  hourlyRecords: Array<{
    okQty: number
    targetQty: number
    partId: string
    ngLogs: Array<{ ngQty: number }>
  }>
}

export async function enrichSessionsWithCyclePerformance<T extends SessionShape>(
  sessions: T[],
): Promise<
  Array<
    T & {
      dashboardPerformancePct: number
      dashboardCycleIdealMinutes: number
      dashboardPerformancePlannedMinutes: number
    }
  >
> {
  const pairs = collectLinePartPairsFromSessions(sessions)
  const latestSessionDate = sessions.reduce<Date | null>((latest, sess) => {
    const sessionDate = sess.reportingDate ?? sess.sessionDate
    if (!latest || sessionDate.getTime() > latest.getTime()) return sessionDate
    return latest
  }, null)
  const targetRows = await fetchLinePartTargetRowsByPair(
    pairs,
    latestSessionDate ? dayEndExclusiveUTC(latestSessionDate) : undefined,
  )
  return sessions.map((sess) => {
    const metaMap = buildLinePartTargetMetaByPairForDate(
      targetRows,
      sess.reportingDate ?? sess.sessionDate,
    )
    const ideal = computeSessionIdealMinutesForPerformance(sess, metaMap)
    const plannedMinutes = sess.hourlyRecords.length * 60
    const pct = calcPerformancePctFromIdealMinutesAndPlannedMinutes(
      ideal,
      plannedMinutes,
    )
    return {
      ...sess,
      dashboardCycleIdealMinutes: ideal,
      dashboardPerformancePlannedMinutes: plannedMinutes,
      dashboardPerformancePct: pct,
    }
  })
}
