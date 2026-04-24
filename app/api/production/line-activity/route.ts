import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'

export type LineActivitySnapshot = {
  hourSlot: number
  okQty: number
  partSamco: number | null
  recordTime: string
  /** กะของ session ที่แถวนี้อยู่ — ใช้ map slot→เวลาเริ่ม (กะเช้า slot11=19:00 ไม่ใช่ 07:00 ของกะดึก) */
  sessionShiftType: 'DAY' | 'NIGHT'
}

/**
 * บันทึกล่าสุดต่อสาย (sessionDate วันนี้ตามไทย — ทุกกะที่ยังเปิดหรือปิดแล้ว + ไม่รวม CANCELLED)
 * — กะดึกยังเห็นบันทึก 19:00 ของกะเช้าได้จนกว่าจะมีบันทึกกะดึกที่ใหม่กว่า
 */
export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = getThaiTodayUTC()

  const latestRows = await prisma.hourlyRecord.findMany({
    where: {
      session: {
        sessionDate: today,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      },
    },
    include: {
      session: { select: { lineId: true, shiftType: true } },
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
    const st = r.session.shiftType
    data[lid] = {
      hourSlot: r.hourSlot,
      okQty: r.okQty,
      partSamco: r.part?.partSamco ?? null,
      recordTime: r.recordTime.toISOString(),
      sessionShiftType: st === 'NIGHT' ? 'NIGHT' : 'DAY',
    }
  }

  return NextResponse.json({ data })
}
