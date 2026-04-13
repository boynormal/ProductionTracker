/**
 * Production time utilities — Thailand (UTC+7, no DST).
 *
 * - Session “calendar dates” use UTC midnight of the Thai calendar day (see getThaiTodayUTC).
 * - Instants stored in PostgreSQL `timestamptz` / Prisma `DateTime` are always UTC (use serverRecordTime() at write).
 * - Shift hour math uses a fixed +7h offset from epoch (not process.env.TZ).
 *
 * @example Prisma: sessions for “Thai today” (half-open range [start, end))
 * ```ts
 * import { prisma } from '@/lib/prisma'
 * import { getThaiTodayUTC, dayEndExclusiveUTC } from '@/lib/time-utils'
 *
 * const start = getThaiTodayUTC()
 * const end = dayEndExclusiveUTC(start)
 *
 * const sessions = await prisma.productionSession.findMany({
 *   where: {
 *     sessionDate: { gte: start, lt: end },
 *   },
 * })
 * ```
 */

/** Fixed offset Thailand vs UTC (no DST). */
export const THAI_OFFSET_MS = 7 * 60 * 60 * 1000

export type ShiftType = 'DAY' | 'NIGHT'

export interface SlotInfo {
  slot: number
  time: string
  endTime: string
  isOvertime: boolean
  isBreak: boolean
}

export const SHIFT_CONFIGS = {
  DAY: {
    type: 'DAY' as ShiftType,
    label: 'กะเช้า',
    labelEn: 'Day Shift',
    startTime: '08:00',
    endTime: '17:00',
    otEndTime: '20:00',
    breakTime: '12:00-13:00',
    normalHours: 8,
    maxOtHours: 3,
    slots: [
      { slot: 1, time: '08:00', endTime: '09:00', isOvertime: false, isBreak: false },
      { slot: 2, time: '09:00', endTime: '10:00', isOvertime: false, isBreak: false },
      { slot: 3, time: '10:00', endTime: '11:00', isOvertime: false, isBreak: false },
      { slot: 4, time: '11:00', endTime: '12:00', isOvertime: false, isBreak: true },
      { slot: 5, time: '13:00', endTime: '14:00', isOvertime: false, isBreak: false },
      { slot: 6, time: '14:00', endTime: '15:00', isOvertime: false, isBreak: false },
      { slot: 7, time: '15:00', endTime: '16:00', isOvertime: false, isBreak: false },
      { slot: 8, time: '16:00', endTime: '17:00', isOvertime: false, isBreak: false },
      { slot: 9, time: '17:00', endTime: '18:00', isOvertime: true, isBreak: false },
      { slot: 10, time: '18:00', endTime: '19:00', isOvertime: true, isBreak: false },
      { slot: 11, time: '19:00', endTime: '20:00', isOvertime: true, isBreak: false },
    ] as SlotInfo[],
  },
  NIGHT: {
    type: 'NIGHT' as ShiftType,
    label: 'กะดึก',
    labelEn: 'Night Shift',
    startTime: '20:00',
    endTime: '05:00',
    otEndTime: '08:00',
    breakTime: '00:00-01:00',
    normalHours: 8,
    maxOtHours: 3,
    slots: [
      { slot: 1, time: '20:00', endTime: '21:00', isOvertime: false, isBreak: false },
      { slot: 2, time: '21:00', endTime: '22:00', isOvertime: false, isBreak: false },
      { slot: 3, time: '22:00', endTime: '23:00', isOvertime: false, isBreak: false },
      { slot: 4, time: '23:00', endTime: '00:00', isOvertime: false, isBreak: true },
      { slot: 5, time: '01:00', endTime: '02:00', isOvertime: false, isBreak: false },
      { slot: 6, time: '02:00', endTime: '03:00', isOvertime: false, isBreak: false },
      { slot: 7, time: '03:00', endTime: '04:00', isOvertime: false, isBreak: false },
      { slot: 8, time: '04:00', endTime: '05:00', isOvertime: false, isBreak: false },
      { slot: 9, time: '05:00', endTime: '06:00', isOvertime: true, isBreak: false },
      { slot: 10, time: '06:00', endTime: '07:00', isOvertime: true, isBreak: false },
      { slot: 11, time: '07:00', endTime: '08:00', isOvertime: true, isBreak: false },
    ] as SlotInfo[],
  },
} as const

// ─── Thai wall clock from instant (manual +7, no env TZ) ─────────────────

/** Current hour in Thailand 0–23 (from fixed UTC+7 offset). */
export function getThaiHour(nowMs: number = Date.now()): number {
  const thaiMs = nowMs + THAI_OFFSET_MS
  return Math.floor((thaiMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
}

/** Current minute in Thailand 0–59. */
export function getThaiMinute(nowMs: number = Date.now()): number {
  const thaiMs = nowMs + THAI_OFFSET_MS
  return Math.floor((thaiMs % (60 * 60 * 1000)) / (60 * 1000))
}

/**
 * “Today” on the Thai calendar as `Date` at `YYYY-MM-DDT00:00:00.000Z` where Y-M-D is the Thai date.
 * Use for `@db.Date` / `sessionDate` equality and ranges in Prisma.
 */
export function getThaiTodayUTC(nowMs: number = Date.now()): Date {
  const thaiMs = nowMs + THAI_OFFSET_MS
  const thaiDayMs = Math.floor(thaiMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  return new Date(thaiDayMs)
}

export function getThaiDaysAgoUTC(days: number, nowMs: number = Date.now()): Date {
  const today = getThaiTodayUTC(nowMs)
  return new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
}

/** For display-only “fake local Thai” instant; do not persist as authoritative time. */
export function getThaiNowDisplay(nowMs: number = Date.now()): Date {
  return new Date(nowMs + THAI_OFFSET_MS)
}

// ─── Strict parsing (no implicit server local TZ) ─────────────────────────

/**
 * ISO-8601 **instant** with mandatory `Z` (UTC). Rejects offset forms (`+07:00`) and date-only.
 * Safe for API payloads: avoids `new Date('2026-04-04T12:00:00')` parsing as host-local.
 */
export function parseIsoInstantUtcStrict(input: string): Date | null {
  const s = input.trim()
  if (!s.endsWith('Z')) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Calendar date `YYYY-MM-DD` → UTC midnight (`T00:00:00.000Z`). No host-TZ interpretation.
 */
export function parseThaiCalendarDateUtc(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt
}

/** @deprecated alias — use parseThaiCalendarDateUtc */
export const parseThaiPickerDateToUTC = parseThaiCalendarDateUtc

/** `YYYY-MM-DD` from a UTC calendar date (e.g. from getThaiTodayUTC). */
export function formatThaiDateUTCISO(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Current Thai wall clock as `YYYY-MM-DDTHH:mm` string — for `<input type="datetime-local">` defaults.
 * Do NOT persist verbatim as UTC; pass through `parseThaiLocalToUtc` on the server.
 */
export function getThaiIsoDateTimeLocal(nowMs: number = Date.now()): string {
  const thaiMs = nowMs + THAI_OFFSET_MS
  const d = new Date(thaiMs)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${min}`
}

/**
 * Parse a Thai wall-time string to a UTC `Date`.
 * - Accepts `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` (treated as Thailand UTC+7)
 * - Also accepts UTC instants ending with `Z` (passed through unchanged)
 * - Returns `null` for any other format
 */
export function parseThaiLocalToUtc(s: string): Date | null {
  const trimmed = s.trim()
  const asInstant = parseIsoInstantUtcStrict(trimmed)
  if (asInstant) return asInstant
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) return null
  const d = new Date(trimmed + '+07:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Format a UTC calendar `Date` (stored as `YYYY-MM-DDT00:00:00.000Z`) for display.
 * Always reads UTC date parts — avoids off-by-one in west-of-UTC browsers / servers.
 *
 * @param localeCode e.g. `'th-TH-u-ca-gregory'` (Thai names, Gregorian year) or `'en-GB'`
 */
export function formatUtcCalendarDate(d: Date, localeCode: string = 'th-TH-u-ca-gregory'): string {
  return new Intl.DateTimeFormat(localeCode, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/** Half-open range end: next calendar day at UTC midnight. */
export function dayEndExclusiveUTC(dayStart: Date): Date {
  const y = dayStart.getUTCFullYear()
  const m = dayStart.getUTCMonth()
  const d = dayStart.getUTCDate()
  return new Date(Date.UTC(y, m, d + 1))
}

// ─── Shifts & slots (Thai hour via manual +7) ─────────────────────────────

export function getCurrentShift(nowMs: number = Date.now()): ShiftType {
  const h = getThaiHour(nowMs)
  if (h >= 8 && h < 20) return 'DAY'
  return 'NIGHT'
}

export function getCurrentHourSlot(shiftType: ShiftType, nowMs: number = Date.now()): number {
  const h = getThaiHour(nowMs)
  const config = SHIFT_CONFIGS[shiftType]

  for (let i = config.slots.length - 1; i >= 0; i--) {
    const slotStartH = parseInt(config.slots[i].time.split(':')[0], 10)
    const adjustedH = shiftType === 'NIGHT' && h < 8 ? h + 24 : h
    const adjustedSlotH = shiftType === 'NIGHT' && slotStartH < 20 ? slotStartH + 24 : slotStartH
    if (adjustedH >= adjustedSlotH) return config.slots[i].slot
  }
  return 1
}

export function isOvertimeSlot(slot: number, normalHours = 8): boolean {
  return slot > normalHours
}

export function getSlotTime(shiftType: ShiftType, slot: number): string {
  const config = SHIFT_CONFIGS[shiftType]
  const s = config.slots.find(x => x.slot === slot)
  return s ? `${s.time}-${s.endTime}` : '--:--'
}

/** เวลาเริ่มของ slot แบบ HH:mm — ใช้กับ `parseThaiLocalToUtc(\`${date}T${time}\`)` (ไม่ใช่ช่วงแบบ getSlotTime) */
export function getSlotStartTime(shiftType: ShiftType, slot: number): string {
  const config = SHIFT_CONFIGS[shiftType]
  const s = config.slots.find(x => x.slot === slot)
  return s?.time ?? '--:--'
}

// ─── Recording ───────────────────────────────────────────────────────────

/** Server-side UTC instant for `recordTime` etc. Never trust client clocks for this. */
export function serverRecordTime(): Date {
  return new Date()
}

// ─── Analysis / display from stored instants (ICU Bangkok) ────────────────

export function getBangkokHour(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value
  return h != null ? parseInt(h, 10) : 0
}

export function isBangkokDayShiftHour(hour: number): boolean {
  return hour >= 8 && hour < 20
}

/**
 * Format a UTC instant for UI in Asia/Bangkok. Same input → same string on server and browser (ICU),
 * so safe to render from serialized ISO props after parseIsoInstantUtcStrict.
 */
export function formatInstantBangkok(
  d: Date,
  opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  return new Intl.DateTimeFormat('en-GB', opts).format(d)
}
