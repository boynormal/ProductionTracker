export function calcAvailability(plannedMin: number, breakdownMin: number): number {
  if (plannedMin === 0) return 0
  const val = ((plannedMin - breakdownMin) / plannedMin) * 100
  return Math.round(val * 10) / 10
}

export function calcPerformance(okQty: number, targetQty: number): number {
  if (targetQty === 0) return 0
  return Math.round((okQty / targetQty) * 100 * 10) / 10
}

export function calcQuality(okQty: number, ngQty: number): number {
  const total = okQty + ngQty
  if (total === 0) return 100
  return Math.round((okQty / total) * 100 * 10) / 10
}

export function calcOEE(availability: number, performance: number, quality: number): number {
  return Math.round((availability / 100) * (performance / 100) * (quality / 100) * 100 * 10) / 10
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
