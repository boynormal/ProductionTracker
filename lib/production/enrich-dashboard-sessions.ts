import { prisma } from '@/lib/prisma'
import {
  type LineTargetMeta,
  calcPerformancePctFromIdealMinutesAndPlannedMinutes,
  computeSessionIdealMinutesForPerformance,
} from '@/lib/utils/oee-cycle-performance'

function linePartKey(lineId: string, partId: string) {
  return `${lineId}:${partId}`
}

export async function fetchLinePartTargetMetaByPair(
  pairs: Array<{ lineId: string; partId: string }>,
): Promise<Map<string, LineTargetMeta>> {
  const unique = new Map<string, { lineId: string; partId: string }>()
  for (const p of pairs) {
    unique.set(linePartKey(p.lineId, p.partId), p)
  }
  const list = [...unique.values()]
  if (list.length === 0) return new Map()

  const rows = await prisma.linePartTarget.findMany({
    where: {
      isActive: true,
      OR: list.map((p) => ({ lineId: p.lineId, partId: p.partId })),
    },
    orderBy: { effectiveDate: 'desc' },
    select: {
      lineId: true,
      partId: true,
      cycleTimeMin: true,
      piecesPerHour: true,
    },
  })

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
  const metaMap = await fetchLinePartTargetMetaByPair(
    collectLinePartPairsFromSessions(sessions),
  )
  return sessions.map((sess) => {
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
