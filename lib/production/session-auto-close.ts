import { getThaiHour, getThaiMinute, getThaiTodayUTC, getThaiDaysAgoUTC, formatThaiDateUTCISO, type ShiftType } from '@/lib/time-utils'

export type AutoCloseMode = 'idle' | 'soft_checkpoint' | 'hard_close'

export type AutoCloseWindow =
  | { mode: 'idle'; reason: string; nowHour: number; nowMinute: number }
  | {
      mode: 'soft_checkpoint'
      reason: string
      shiftType: ShiftType
      nowHour: number
      nowMinute: number
    }
  | {
      mode: 'hard_close'
      reason: string
      shiftType: ShiftType
      nowHour: number
      nowMinute: number
      reportingDates: Date[]
      reportingDateKeys: string[]
    }

/** Thai time: DAY hard-close band — from 20:15 through 23:59 (any minute). */
function isDayHardCloseBand(hour: number, minute: number): boolean {
  if (hour >= 21 && hour <= 23) return true
  if (hour === 20 && minute >= 15) return true
  return false
}

/** Thai time: NIGHT hard-close band — from 08:15 through 11:59 for yesterday's reporting date. */
function isNightHardCloseBand(hour: number, minute: number): boolean {
  if (hour >= 9 && hour <= 11) return true
  if (hour === 8 && minute >= 15) return true
  return false
}

/**
 * Auto-close policy:
 * - Soft checkpoint only (log, no status change): DAY 17:15 / NIGHT 05:15
 * - Hard close (COMPLETED): continuous Thai-time bands so infrequent cron still catches sessions
 *   - DAY: 20:15–23:59, reportingDate = Thai "today"
 *   - NIGHT: 08:15–11:59, reportingDate = Thai "yesterday"
 */
export function resolveAutoCloseWindow(nowMs: number = Date.now()): AutoCloseWindow {
  const hour = getThaiHour(nowMs)
  const minute = getThaiMinute(nowMs)
  const today = getThaiTodayUTC(nowMs)
  const yesterday = getThaiDaysAgoUTC(1, nowMs)

  if (hour === 17 && minute === 15) {
    return {
      mode: 'soft_checkpoint',
      reason: 'DAY_SOFT_CHECKPOINT_17_15',
      shiftType: 'DAY',
      nowHour: hour,
      nowMinute: minute,
    }
  }

  if (hour === 5 && minute === 15) {
    return {
      mode: 'soft_checkpoint',
      reason: 'NIGHT_SOFT_CHECKPOINT_05_15',
      shiftType: 'NIGHT',
      nowHour: hour,
      nowMinute: minute,
    }
  }

  if (isDayHardCloseBand(hour, minute)) {
    return {
      mode: 'hard_close',
      reason: 'DAY_HARD_CLOSE_BAND_20_15_TO_23_59',
      shiftType: 'DAY',
      nowHour: hour,
      nowMinute: minute,
      reportingDates: [today],
      reportingDateKeys: [formatThaiDateUTCISO(today)],
    }
  }

  if (isNightHardCloseBand(hour, minute)) {
    return {
      mode: 'hard_close',
      reason: 'NIGHT_HARD_CLOSE_BAND_08_15_TO_11_59',
      shiftType: 'NIGHT',
      nowHour: hour,
      nowMinute: minute,
      reportingDates: [yesterday],
      reportingDateKeys: [formatThaiDateUTCISO(yesterday)],
    }
  }

  return {
    mode: 'idle',
    reason: 'OUTSIDE_AUTO_CLOSE_WINDOW',
    nowHour: hour,
    nowMinute: minute,
  }
}
