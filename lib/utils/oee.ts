export function calcAvailability(plannedMin: number, breakdownMin: number): number {
  if (plannedMin === 0) return 0
  const val = ((plannedMin - breakdownMin) / plannedMin) * 100
  const floored = Math.floor(val * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

export function calcPerformance(okQty: number, targetQty: number): number {
  if (targetQty === 0) return 0
  const val = (okQty / targetQty) * 100
  const floored = Math.floor(val * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

export function calcQuality(okQty: number, ngQty: number): number {
  const total = okQty + ngQty
  if (total === 0) return 100
  const raw = (okQty / total) * 100
  const floored = Math.floor(raw * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

export function calcOEE(availability: number, performance: number, quality: number): number {
  const val = (availability / 100) * (performance / 100) * (quality / 100) * 100
  const floored = Math.floor(val * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

export function getOeeColor(oee: number): string {
  if (oee >= 85) return 'text-green-600'
  if (oee >= 65) return 'text-yellow-500'
  return 'text-red-500'
}

export function getOeeBg(oee: number): string {
  if (oee >= 85) return 'bg-green-100 text-green-800'
  if (oee >= 65) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}
