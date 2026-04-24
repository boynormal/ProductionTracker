import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { getCurrentShift } from '@/lib/utils/shift'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'

export type LineActivitySnapshot = {
  hourSlot: number
  okQty: number
  partSamco: number | null
  recordTime: string
}

/**
 * บันทึกล่าสุดต่อสาย (sessionDate วันนี้ตามไทย + กะปัจจุบัน + IN_PROGRESS)
 * — ใช้รีเฟรช badge บนหน้า record แทนค่า SSR ที่ค้าง
 */
export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = getThaiTodayUTC()
  const shift = getCurrentShift()

  const latestRows = await prisma.hourlyRecord.findMany({
    where: {
      session: {
        sessionDate: today,
        shiftType: shift,
        status: 'IN_PROGRESS',
      },
    },
    include: {
      session: { select: { lineId: true } },
      part: { select: { partSamco: true } },
    },
    /** ล่าสุดตามเวลาแก้ไขจริง — ไม่ใช้แค่ hourSlot สูงสุด (กัน UI ค้างช่อง OT ท้ายกะทั้งที่เพิ่งแก้ช่องก่อนหน้า) */
    orderBy: [{ updatedAt: 'desc' }, { hourSlot: 'desc' }],
    take: 800,
  })

  const data: Record<string, LineActivitySnapshot> = {}
  for (const r of latestRows) {
    const lid = r.session.lineId
    if (data[lid] != null) continue
    data[lid] = {
      hourSlot: r.hourSlot,
      okQty: r.okQty,
      partSamco: r.part?.partSamco ?? null,
      recordTime: r.recordTime.toISOString(),
    }
  }

  return NextResponse.json({ data })
}
