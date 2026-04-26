import { prisma } from '@/lib/prisma'
import {
  formatThaiDateUTCISO,
  getThaiReportingDateUTC,
  parseThaiLocalToUtc,
  SHIFT_CONFIGS,
  type ShiftType,
} from '@/lib/time-utils'

export type HourlyAlertWindow = {
  bufferMinutes: number
  eligibleAt: Date
  reportingDate: Date
  shiftType: ShiftType
  hourSlot: number
  windowStart: Date
  windowEnd: Date
  windowLabel: string
  windowKey: string
}

export type DivisionHourlyAlertGroup = {
  divisionId: string
  divisionCode: string
  divisionName: string
  telegramEnabled: boolean
  telegramChatId: string | null
  lineCodes: string[]
  missingLineCodes: string[]
  okQty: number
  ngQty: number
  targetQty: number
  breakdownCount: number
  breakdownMinutes: number
}

const HOURLY_ALERT_TYPE = 'HOURLY_DIVISION_SUMMARY'

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function parseSlotBoundaryUtc(reportingDate: Date, shiftType: ShiftType, hhmm: string): Date {
  const hour = Number.parseInt(hhmm.slice(0, 2), 10)
  const baseDate = shiftType === 'NIGHT' && hour < 8 ? addUtcDays(reportingDate, 1) : reportingDate
  const parsed = parseThaiLocalToUtc(`${formatThaiDateUTCISO(baseDate)}T${hhmm}`)
  if (!parsed) throw new Error(`Invalid slot boundary ${shiftType} ${hhmm}`)
  return parsed
}

function floor2(value: number): number {
  const floored = Math.floor(value * 100) / 100
  return Math.min(100, Math.max(0, floored))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function getLatestCompletedHourlyAlertWindow(now: Date = new Date(), bufferMinutes = 30): HourlyAlertWindow {
  const eligibleAt = new Date(now.getTime() - bufferMinutes * 60 * 1000)
  const currentReportingDate = getThaiReportingDateUTC(eligibleAt.getTime())
  const candidateReportingDates = [addUtcDays(currentReportingDate, -1), currentReportingDate]

  let selected: HourlyAlertWindow | null = null

  for (const reportingDate of candidateReportingDates) {
    for (const shiftType of ['DAY', 'NIGHT'] as const) {
      for (const slot of SHIFT_CONFIGS[shiftType].slots) {
        const windowStart = parseSlotBoundaryUtc(reportingDate, shiftType, slot.time)
        const windowEnd = parseSlotBoundaryUtc(reportingDate, shiftType, slot.endTime)
        if (windowEnd.getTime() > eligibleAt.getTime()) continue
        const candidate: HourlyAlertWindow = {
          bufferMinutes,
          eligibleAt,
          reportingDate,
          shiftType,
          hourSlot: slot.slot,
          windowStart,
          windowEnd,
          windowLabel: `${slot.time}-${slot.endTime}`,
          windowKey: `${formatThaiDateUTCISO(reportingDate)}:${shiftType}:${slot.slot}`,
        }
        if (!selected || candidate.windowEnd.getTime() > selected.windowEnd.getTime()) {
          selected = candidate
        }
      }
    }
  }

  if (!selected) {
    throw new Error('No eligible hourly alert window found')
  }

  return selected
}

export function buildDivisionHourlyAlertMessage(group: DivisionHourlyAlertGroup, window: HourlyAlertWindow): string {
  const recordedLines = group.lineCodes.length - group.missingLineCodes.length
  const achievement = group.targetQty > 0 ? floor2((group.okQty / group.targetQty) * 100) : 0
  const linesText = group.lineCodes.length > 0 ? group.lineCodes.map((line) => `- ${escapeHtml(line)}`).join('\n') : '- —'
  const missingText = group.missingLineCodes.length > 0
    ? `\nยังไม่บันทึก: ${group.missingLineCodes.map((line) => escapeHtml(line)).join(', ')}`
    : ''
  return [
    '📣 <b>สรุปการผลิตรายชั่วโมง</b>',
    `ช่วงเวลา: <b>${escapeHtml(window.windowLabel)}</b>`,
    `ฝ่าย: <b>${escapeHtml(group.divisionName || group.divisionCode)}</b>`,
    `สายทั้งหมด: ${group.lineCodes.length}`,
    `บันทึกแล้ว: ${recordedLines}`,
    `OK: ${group.okQty.toLocaleString('en-US')}`,
    `NG: ${group.ngQty.toLocaleString('en-US')}`,
    `Target: ${group.targetQty.toLocaleString('en-US')}`,
    `Achievement: ${achievement.toFixed(2)}%`,
    `Breakdown: ${group.breakdownCount.toLocaleString('en-US')} ครั้ง / ${group.breakdownMinutes.toLocaleString('en-US')} นาที`,
    '',
    'สายในช่วงนี้',
    linesText + missingText,
  ].join('\n')
}

export async function ensureTelegramAlertLogStorage(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "telegram_alert_logs" (
      "id" text PRIMARY KEY,
      "alertType" text NOT NULL,
      "divisionId" text,
      "chatId" text,
      "windowStart" timestamptz NOT NULL,
      "windowEnd" timestamptz NOT NULL,
      "windowKey" text NOT NULL,
      "status" text NOT NULL,
      "message" text NOT NULL,
      "errorMessage" text,
      "sentAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "telegram_alert_logs_alertType_divisionId_windowKey_key"
    ON "telegram_alert_logs" ("alertType", "divisionId", "windowKey")
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "telegram_alert_logs_divisionId_createdAt_idx"
    ON "telegram_alert_logs" ("divisionId", "createdAt")
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "telegram_alert_logs_alertType_windowStart_idx"
    ON "telegram_alert_logs" ("alertType", "windowStart")
  `)
}

export async function hasTelegramAlertBeenSent(divisionId: string, windowKey: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "telegram_alert_logs"
    WHERE "alertType" = ${HOURLY_ALERT_TYPE}
      AND "divisionId" = ${divisionId}
      AND "windowKey" = ${windowKey}
    LIMIT 1
  `
  return rows.length > 0
}

export async function writeTelegramAlertLog(args: {
  divisionId: string
  chatId: string | null
  window: HourlyAlertWindow
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  message: string
  errorMessage?: string | null
  sentAt?: Date | null
}): Promise<void> {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const now = new Date()
  await prisma.$executeRaw`
    INSERT INTO "telegram_alert_logs"
      ("id", "alertType", "divisionId", "chatId", "windowStart", "windowEnd", "windowKey", "status", "message", "errorMessage", "sentAt", "createdAt", "updatedAt")
    VALUES
      (${id}, ${HOURLY_ALERT_TYPE}, ${args.divisionId}, ${args.chatId}, ${args.window.windowStart}, ${args.window.windowEnd}, ${args.window.windowKey}, ${args.status}, ${args.message}, ${args.errorMessage ?? null}, ${args.sentAt ?? null}, ${now}, ${now})
    ON CONFLICT ("alertType", "divisionId", "windowKey") DO UPDATE
    SET
      "chatId" = EXCLUDED."chatId",
      "status" = EXCLUDED."status",
      "message" = EXCLUDED."message",
      "errorMessage" = EXCLUDED."errorMessage",
      "sentAt" = EXCLUDED."sentAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `
}
