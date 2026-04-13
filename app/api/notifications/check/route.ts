import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTelegramAlert } from '@/lib/telegram'
import { getCurrentShift, getCurrentHourSlot } from '@/lib/utils/shift'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'

export async function GET() {
  try {
    const today = getThaiTodayUTC()

    // ตรวจวันหยุด
    const holiday = await prisma.holiday.findFirst({
      where: { date: today, isActive: true },
    })
    if (holiday) return NextResponse.json({ message: 'Holiday — skipped' })

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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
