import {
  getThaiIsoDateTimeLocal,
  parseThaiCalendarDateUtc,
  formatThaiDateUTCISO,
  parseThaiLocalToUtc,
  type ShiftType,
} from '@/lib/time-utils'
import { getSlotStartTime } from '@/lib/utils/shift'

export const TIME_ONLY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** เวลาไทย HH:mm จากนาฬิกาไทยปัจจุบัน */
export function getThaiTimeLocal(nowMs: number = Date.now()): string {
  return getThaiIsoDateTimeLocal(nowMs).slice(11, 16)
}

export function parseTimeInputToMinutes(value?: string): number | null {
  if (!value) return null
  const match = TIME_ONLY_RE.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function shiftThaiDateIso(dateIso: string, days: number): string | null {
  const parsed = parseThaiCalendarDateUtc(dateIso)
  if (!parsed) return null
  return formatThaiDateUTCISO(new Date(parsed.getTime() + days * 24 * 60 * 60 * 1000))
}

/**
 * สร้างสตริงส่ง API (เวลาไทย) + นาที จากวันที่ session (YYYY-MM-DD ตามปฏิทินไทย) และเวลา HH:mm
 */
export function buildBreakdownDateTimeRange(baseDateIso: string, startTime?: string, endTime?: string) {
  const startMinutes = parseTimeInputToMinutes(startTime)
  const endMinutes = parseTimeInputToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) return null

  const crossesMidnight = endMinutes < startMinutes
  const endDateIso = crossesMidnight ? shiftThaiDateIso(baseDateIso, 1) : baseDateIso
  if (!endDateIso) return null

  const breakTimeMin = (crossesMidnight ? endMinutes + 24 * 60 : endMinutes) - startMinutes
  return {
    breakdownStart: `${baseDateIso}T${startTime}`,
    breakdownEnd: `${endDateIso}T${endTime}`,
    breakTimeMin,
    crossesMidnight,
  }
}

/** แปลง instant ที่เก็บใน DB เป็น HH:mm ตามเขต Asia/Bangkok (สำหรับ input type=time) */
const DEFAULT_MAX_BREAKDOWN_TOTAL_MIN = 60

/**
 * Breakdown แบบกรอกแค่นาที — สร้างช่วงเวลาต่อเนื่องจากต้นชั่วโมงของ slot (anchor แรก = เวลาเริ่มชั่วโมง)
 * ส่ง API เป็น ISO instant ให้ normalize บนเซิร์ฟเวอร์ตรวจ breakTimeMin ตรงกับช่วง
 */
export function buildBreakdownIntervalsFromSlotMinutes(
  baseDateIso: string,
  shiftType: ShiftType,
  hourSlot: number,
  breakTimeMins: number[],
  options?: { maxTotalMinutes?: number },
): { breakdownStart: string; breakdownEnd: string; breakTimeMin: number }[] | null {
  const maxTotal = options?.maxTotalMinutes ?? DEFAULT_MAX_BREAKDOWN_TOTAL_MIN
  const slotTime = getSlotStartTime(shiftType, hourSlot)
  const slotStartStr = `${baseDateIso}T${slotTime}`
  let cursor = parseThaiLocalToUtc(slotStartStr)
  if (!cursor) return null

  const out: { breakdownStart: string; breakdownEnd: string; breakTimeMin: number }[] = []
  let total = 0
  for (const m of breakTimeMins) {
    if (!Number.isFinite(m) || m < 1) return null
    const mi = Math.round(m)
    total += mi
    if (total > maxTotal) return null
    const startMs: number = cursor.getTime()
    const endMs: number = startMs + mi * 60_000
    out.push({
      breakdownStart: new Date(startMs).toISOString(),
      breakdownEnd: new Date(endMs).toISOString(),
      breakTimeMin: mi,
    })
    cursor = new Date(endMs)
  }
  return out
}

export function utcInstantToThaiTimeHHmm(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) return '00:00'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}
