import { dayEndExclusiveUTC, parseThaiCalendarDateUtc } from '@/lib/time-utils'

/** ช่วงวันที่สูงสุดต่อคำขอ GET /api/production/reports (ลดภาระ query + memory) */
export const MAX_PRODUCTION_REPORT_RANGE_DAYS = 365

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isProductionReportRangeAllowed(fromYmd: string, toYmd: string): boolean {
  const fromDate = parseThaiCalendarDateUtc(fromYmd)
  const toDate = parseThaiCalendarDateUtc(toYmd)
  if (!fromDate || !toDate) return false
  const toExclusive = dayEndExclusiveUTC(toDate)
  if (fromDate >= toExclusive) return false
  const rangeMs = toExclusive.getTime() - fromDate.getTime()
  return rangeMs <= MAX_PRODUCTION_REPORT_RANGE_DAYS * MS_PER_DAY
}
