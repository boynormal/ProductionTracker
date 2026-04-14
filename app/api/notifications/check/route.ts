import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTelegramAlert } from '@/lib/telegram'
import { getCurrentShift, getCurrentHourSlot } from '@/lib/utils/shift'
import { getThaiTodayUTC, isThaiCalendarSunday } from '@/lib/utils/thai-time'
import { logError, logInfo, logWarn } from '@/lib/logging/app-log'
import { auth } from '@/lib/auth'
import { isValidCronRequest } from '@/lib/cron-auth'

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

    const sessions = await prisma.productionSession.findMany({
      where: { sessionDate: today, shiftType: currentShift, status: 'IN_PROGRESS' },
      include: { line: true, machine: true, hourlyRecords: true },
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
        await logWarn({
          source: 'notifications.check',
          category: 'missing-record',
          message: 'Missing production record detected',
          details: {
            lineCode: session.line?.lineCode ?? null,
            sessionId: session.id,
            missingSlots,
            shiftType: currentShift,
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

        await sendTelegramAlert(msg)
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
