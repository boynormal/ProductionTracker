import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTelegramAlert } from '@/lib/telegram'
import { auth } from '@/lib/auth'
import { isValidCronRequest } from '@/lib/cron-auth'
import { logError, logInfo } from '@/lib/logging/app-log'
import { isThaiCalendarSunday, parseThaiLocalToUtc } from '@/lib/time-utils'
import {
  buildDivisionHourlyAlertMessage,
  ensureTelegramAlertLogStorage,
  getLatestCompletedHourlyAlertWindow,
  hasTelegramAlertBeenSent,
  writeTelegramAlertLog,
  type DivisionHourlyAlertGroup,
} from '@/lib/notifications/telegram-hourly-alert'

function parseBufferMinutes(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get('bufferMinutes') ?? process.env.TELEGRAM_HOURLY_ALERT_BUFFER_MINUTES ?? '30'
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 180) return 30
  return parsed
}

function parseNowOverride(req: NextRequest): Date | null {
  const raw = req.nextUrl.searchParams.get('at')?.trim()
  if (!raw) return null
  return parseThaiLocalToUtc(raw) ?? null
}

function maskChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null
  const trimmed = chatId.trim()
  if (trimmed.length <= 6) return trimmed
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`
}

export async function GET(req: NextRequest) {
  const cronOk = isValidCronRequest(req)
  if (!cronOk) {
    const session = await auth()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const now = parseNowOverride(req) ?? new Date()
    const bufferMinutes = parseBufferMinutes(req)
    const window = getLatestCompletedHourlyAlertWindow(now, bufferMinutes)

    if (isThaiCalendarSunday(window.reportingDate)) {
      await logInfo({
        source: 'notifications.hourly',
        category: 'scheduler',
        message: 'Hourly Telegram alert skipped on Sunday',
        details: { windowKey: window.windowKey },
      })
      return NextResponse.json({ message: 'Sunday — skipped', windowKey: window.windowKey })
    }

    const holiday = await prisma.holiday.findFirst({
      where: { date: window.reportingDate, isActive: true },
    })
    if (holiday) {
      await logInfo({
        source: 'notifications.hourly',
        category: 'scheduler',
        message: 'Hourly Telegram alert skipped on holiday',
        details: { windowKey: window.windowKey, holidayName: holiday.name },
      })
      return NextResponse.json({ message: 'Holiday — skipped', windowKey: window.windowKey })
    }

    await ensureTelegramAlertLogStorage()
    const globalChatId = process.env.TELEGRAM_CHAT_ID?.trim() || null

    const sessions = await prisma.productionSession.findMany({
      where: {
        reportingDate: window.reportingDate,
        shiftType: window.shiftType,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        line: {
          include: {
            section: {
              include: {
                division: true,
              },
            },
          },
        },
        hourlyRecords: {
          where: { hourSlot: window.hourSlot },
          include: {
            breakdownLogs: true,
            ngLogs: true,
          },
        },
      },
    })

    const groups = new Map<string, DivisionHourlyAlertGroup>()

    for (const session of sessions) {
      const division = session.line?.section?.division
      if (!division?.id) continue
      const lineCode = String(session.line?.lineCode ?? session.lineId ?? '—')
      const existing = groups.get(division.id) ?? {
        divisionId: division.id,
        divisionCode: division.divisionCode,
        divisionName: division.divisionName,
        telegramEnabled: division.telegramEnabled !== false,
        telegramChatId: division.telegramChatId,
        lineCodes: [],
        missingLineCodes: [],
        okQty: 0,
        ngQty: 0,
        targetQty: 0,
        breakdownCount: 0,
        breakdownMinutes: 0,
      }
      if (!existing.lineCodes.includes(lineCode)) {
        existing.lineCodes.push(lineCode)
      }
      const record = session.hourlyRecords[0]
      if (!record) {
        if (!existing.missingLineCodes.includes(lineCode)) {
          existing.missingLineCodes.push(lineCode)
        }
        groups.set(division.id, existing)
        continue
      }
      existing.okQty += record.okQty ?? 0
      existing.targetQty += record.targetQty ?? 0
      existing.ngQty += Array.isArray(record.ngLogs) ? record.ngLogs.reduce((sum, ng) => sum + (ng.ngQty ?? 0), 0) : 0
      existing.breakdownCount += Array.isArray(record.breakdownLogs) ? record.breakdownLogs.length : 0
      existing.breakdownMinutes += Array.isArray(record.breakdownLogs)
        ? record.breakdownLogs.reduce((sum, bd) => sum + (bd.breakTimeMin ?? 0), 0)
        : 0
      groups.set(division.id, existing)
    }

    let sent = 0
    let failed = 0
    let skipped = 0
    let duplicates = 0
    const routingSummary = {
      division: 0,
      globalFallback: 0,
      disabled: 0,
      noDestination: 0,
    }

    for (const group of groups.values()) {
      const alreadySent = await hasTelegramAlertBeenSent(group.divisionId, window.windowKey)
      if (alreadySent) {
        duplicates++
        continue
      }

      const message = buildDivisionHourlyAlertMessage(group, window)
      const divisionChatId = group.telegramChatId?.trim() || null
      const chatId = group.telegramEnabled ? (divisionChatId || globalChatId) : null
      const telegramRoute = !group.telegramEnabled
        ? 'disabled'
        : divisionChatId
          ? 'division'
          : globalChatId
            ? 'global_fallback'
            : 'no_destination'

      if (!group.telegramEnabled) {
        await writeTelegramAlertLog({
          divisionId: group.divisionId,
          chatId: null,
          window,
          status: 'SKIPPED',
          message,
          errorMessage: 'Division Telegram disabled',
        })
        routingSummary.disabled++
        skipped++
        continue
      }

      if (!chatId) {
        await writeTelegramAlertLog({
          divisionId: group.divisionId,
          chatId: null,
          window,
          status: 'SKIPPED',
          message,
          errorMessage: 'Missing division Telegram chat id',
        })
        routingSummary.noDestination++
        skipped++
        continue
      }

      const ok = await sendTelegramAlert(message, { chatId })
      if (ok) {
        await writeTelegramAlertLog({
          divisionId: group.divisionId,
          chatId,
          window,
          status: 'SENT',
          message,
          sentAt: new Date(),
        })
        if (telegramRoute === 'division') routingSummary.division++
        else routingSummary.globalFallback++
        sent++
      } else {
        await writeTelegramAlertLog({
          divisionId: group.divisionId,
          chatId,
          window,
          status: 'FAILED',
          message,
          errorMessage: 'Telegram API send failed',
        })
        if (telegramRoute === 'division') routingSummary.division++
        else if (telegramRoute === 'global_fallback') routingSummary.globalFallback++
        failed++
      }

      await logInfo({
        source: 'notifications.hourly',
        category: 'telegram-route',
        message: 'Hourly Telegram alert routing resolved',
        details: {
          divisionId: group.divisionId,
          divisionCode: group.divisionCode,
          divisionName: group.divisionName,
          telegramRoute,
          telegramChatIdMasked: maskChatId(chatId),
          windowKey: window.windowKey,
        },
      })
    }

    await logInfo({
      source: 'notifications.hourly',
      category: 'telegram',
      message: 'Hourly Telegram alert job completed',
      details: {
        windowKey: window.windowKey,
        windowLabel: window.windowLabel,
        sent,
        failed,
        skipped,
        duplicates,
        divisionCount: groups.size,
        routingSummary,
      },
    })

    return NextResponse.json({
      message: 'Hourly Telegram alert processed',
      windowKey: window.windowKey,
      windowLabel: window.windowLabel,
      sent,
      failed,
      skipped,
      duplicates,
      divisionCount: groups.size,
      routingSummary,
    })
  } catch (err) {
    console.error('[Hourly Telegram Alert Error]', err)
    await logError({
      source: 'notifications.hourly',
      category: 'telegram',
      message: 'Hourly Telegram alert job failed',
      details: { error: err instanceof Error ? err.message : String(err) },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
