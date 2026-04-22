import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTelegramAlert } from '@/lib/telegram'
import { getCurrentShift, getCurrentHourSlot } from '@/lib/utils/shift'
import { getThaiTodayUTC, isThaiCalendarSunday } from '@/lib/utils/thai-time'
import { logError, logInfo, logWarn } from '@/lib/logging/app-log'
import { auth } from '@/lib/auth'
import { isValidCronRequest } from '@/lib/cron-auth'

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
    const today = getThaiTodayUTC()

    // วันอาทิตย์ = วันหยุดประจำสัปดาห์ — ไม่แจ้งเตือน missing record
    if (isThaiCalendarSunday(today)) {
      await logInfo({
        source: 'notifications.check',
        category: 'scheduler',
        message: 'Notification check skipped on Sunday',
      })
      return NextResponse.json({ message: 'Sunday — skipped' })
    }

    // ตรวจวันหยุด
    const holiday = await prisma.holiday.findFirst({
      where: { date: today, isActive: true },
    })
    if (holiday) {
      await logInfo({
        source: 'notifications.check',
        category: 'scheduler',
        message: 'Notification check skipped on holiday',
        details: { holidayName: holiday.name, date: holiday.date.toISOString() },
      })
      return NextResponse.json({ message: 'Holiday — skipped' })
    }

    const currentShift = getCurrentShift()
    const expectedSlot = getCurrentHourSlot(currentShift)

    const globalChatId = process.env.TELEGRAM_CHAT_ID?.trim() || ''

    const sessions = await prisma.productionSession.findMany({
      where: { sessionDate: today, shiftType: currentShift, status: 'IN_PROGRESS' },
      include: {
        line: {
          select: {
            id: true,
            lineCode: true,
            section: {
              select: {
                id: true,
                sectionCode: true,
                division: {
                  select: {
                    id: true,
                    divisionCode: true,
                    divisionName: true,
                    telegramChatId: true,
                    telegramEnabled: true,
                  },
                },
              },
            },
          },
        },
        machine: { select: { id: true, mcNo: true } },
        hourlyRecords: { select: { hourSlot: true } },
      },
    })

    let alertCount = 0

    for (const session of sessions) {
      const recordedSlots = session.hourlyRecords.map(r => r.hourSlot)
      const missingSlots: number[] = []
      for (let slot = 1; slot < expectedSlot; slot++) {
        if (!recordedSlots.includes(slot)) missingSlots.push(slot)
      }

      if (missingSlots.length > 0) {
        const msg = `⚠️ สาย ${session.line?.lineCode ?? session.machine?.mcNo ?? '?'} ยังไม่บันทึกข้อมูล ชม.ที่ ${missingSlots.join(', ')}`
        const division = session.line?.section?.division ?? null
        const divisionChatId = division?.telegramEnabled === false
          ? ''
          : (division?.telegramChatId?.trim() || '')
        const selectedChatId = divisionChatId || globalChatId
        const telegramRoute = divisionChatId
          ? 'division'
          : (globalChatId ? (division?.telegramEnabled === false ? 'global_fallback_division_disabled' : 'global_fallback') : 'none')

        await logWarn({
          source: 'notifications.check',
          category: 'missing-record',
          message: 'Missing production record detected',
          details: {
            lineCode: session.line?.lineCode ?? null,
            sessionId: session.id,
            missingSlots,
            shiftType: currentShift,
            divisionId: division?.id ?? null,
            divisionCode: division?.divisionCode ?? null,
            telegramRoute,
            telegramChatIdMasked: maskChatId(selectedChatId),
          },
        })

        await prisma.notification.create({
          data: {
            type:       'MISSING_RECORD',
            title:      'ไม่มีการบันทึกข้อมูล',
            message:    msg,
            targetRole: 'SUPERVISOR',
            machineId:  session.machineId,
            sessionId:  session.id,
            hourSlot:   missingSlots[0],
            sentVia:    'BOTH',
          },
        })

        if (selectedChatId) {
          await sendTelegramAlert(msg, { chatId: selectedChatId })
        } else {
          await logInfo({
            source: 'notifications.check',
            category: 'telegram',
            message: 'Skipped Telegram send due to missing destination chat id',
            details: {
              sessionId: session.id,
              lineCode: session.line?.lineCode ?? null,
              divisionId: division?.id ?? null,
              divisionCode: division?.divisionCode ?? null,
              telegramRoute,
            },
          })
        }
        alertCount++
      }
    }

    return NextResponse.json({ message: `Checked ${sessions.length} sessions, ${alertCount} alerts sent` })
  } catch (err) {
    console.error('[Notification Check Error]', err)
    await logError({
      source: 'notifications.check',
      category: 'scheduler',
      message: 'Notification check failed',
      details: { error: err instanceof Error ? err.message : String(err) },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
