/**
 * Performance (P) from ideal cycle time × gross output vs planned window.
 * T_min = (จำนวนชม.ที่บันทึก) × 60 = hourlyRecords.length × 60.
 * Gross per hour = okQty + sum(ngLogs.ngQty).
 * CT from LinePartTarget.cycleTimeMin, else 60/piecesPerHour, else 60/targetQty from the hour row.
 */

export type LineTargetMeta = {
  cycleTimeMin: number | null
  piecesPerHour: number
}

export function resolveCycleMinutesPerPiece(
  master: LineTargetMeta | undefined,
  targetQtyFromHour: number,
): number | null {
  const ct = master?.cycleTimeMin
  if (ct != null && ct > 0) return ct
  const pph = master?.piecesPerHour
  if (pph != null && pph > 0) return 60 / pph
  if (targetQtyFromHour > 0) return 60 / targetQtyFromHour
  return null
}

export function computeSessionIdealMinutesForPerformance(
  session: {
    lineId: string
    hourlyRecords: Array<{
      okQty: number
      targetQty: number
      partId: string
      ngLogs: Array<{ ngQty: number }>
    }>
  },
  metaMap: Map<string, LineTargetMeta>,
): number {
  let ideal = 0
  for (const hr of session.hourlyRecords) {
    const gross = hr.okQty + hr.ngLogs.reduce((s, n) => s + n.ngQty, 0)
    if (gross <= 0) continue
    const meta = metaMap.get(`${session.lineId}:${hr.partId}`)
    const ct = resolveCycleMinutesPerPiece(meta, hr.targetQty)
    if (ct != null && ct > 0) ideal += ct * gross
  }
  return ideal
}

export function calcPerformancePctFromIdealMinutesAndPlannedMinutes(
  totalIdealMinutes: number,
  plannedMinutes: number,
): number {
  if (plannedMinutes <= 0 || totalIdealMinutes <= 0) return 0
  const val = (totalIdealMinutes / plannedMinutes) * 100
  const floored = Math.floor(val * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

export function aggregateDashboardCyclePerformancePct(
  sessions: Array<{
    dashboardCycleIdealMinutes: number
    dashboardPerformancePlannedMinutes?: number
    hourlyRecords?: unknown[]
  }>,
): number {
  let sumIdeal = 0
  let sumPlanned = 0
  for (const s of sessions) {
    sumIdeal += s.dashboardCycleIdealMinutes
    const planned =
      typeof s.dashboardPerformancePlannedMinutes === 'number'
        ? s.dashboardPerformancePlannedMinutes
        : (Array.isArray(s.hourlyRecords) ? s.hourlyRecords.length : 0) * 60
    sumPlanned += planned
  }
  return calcPerformancePctFromIdealMinutesAndPlannedMinutes(sumIdeal, sumPlanned)
}
