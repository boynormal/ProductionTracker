import { getThaiHour, getThaiMinute, getThaiTodayUTC, getThaiDaysAgoUTC, formatThaiDateUTCISO, type ShiftType } from '@/lib/time-utils'

const HARD_CLOSE_MINUTES = [15, 20, 25] as const

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

/**
 * Auto-close policy:
 * - Soft checkpoint only: DAY 17:15 / NIGHT 05:15
 * - Hard close windows (retry): DAY 20:15,20,25 / NIGHT 08:15,20,25
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

  if (hour === 20 && HARD_CLOSE_MINUTES.includes(minute as (typeof HARD_CLOSE_MINUTES)[number])) {
    return {
      mode: 'hard_close',
      reason: `DAY_HARD_CLOSE_20_${String(minute).padStart(2, '0')}`,
      shiftType: 'DAY',
      nowHour: hour,
      nowMinute: minute,
      reportingDates: [today],
      reportingDateKeys: [formatThaiDateUTCISO(today)],
    }
  }

  if (hour === 8 && HARD_CLOSE_MINUTES.includes(minute as (typeof HARD_CLOSE_MINUTES)[number])) {
    return {
      mode: 'hard_close',
      reason: `NIGHT_HARD_CLOSE_08_${String(minute).padStart(2, '0')}`,
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

