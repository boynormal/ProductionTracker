import { prisma } from '@/lib/prisma'

export interface MtbfResult {
  machineId:        string
  period:           { start: Date; end: Date }
  totalAvailableHr: number
  totalDowntimeHr:  number
  totalUptimeHr:    number
  failureCount:     number
  mtbf:             number
  mttr:             number
}

/**
 * คำนวณ MTBF / MTTR ระดับเครื่องจักร
 *
 * Session ใช้ lineId ของเครื่องนั้น (เพราะ session ปัจจุบัน unique บน Line ไม่ใช่ Machine)
 * Breakdown ใช้ breakdownLog.machineId โดยตรง (ไม่ต้อง join ผ่าน hourlyRecord)
 */
export async function calcMtbfMttr(
  machineId: string,
  startDate: Date,
  endDate: Date,
): Promise<MtbfResult> {
  // หา lineId ของเครื่องนี้
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { lineId: true },
  })

  const [sessions, breakdowns] = await Promise.all([
    prisma.productionSession.findMany({
      where: {
        lineId:      machine?.lineId ?? '__none__',
        status:      'COMPLETED',
        sessionDate: { gte: startDate, lte: endDate },
      },
      select: { totalHours: true },
    }),
    // ใช้ breakdown_logs.machineId (field ใหม่) แทนการ join ผ่าน hourlyRecord
    prisma.breakdownLog.findMany({
      where: {
        machineId,
        breakdownEnd: { not: null },
        hourlyRecord: {
          session: {
            status:      'COMPLETED',
            sessionDate: { gte: startDate, lte: endDate },
          },
        },
      },
      select: { breakTimeMin: true },
    }),
  ])

  const totalAvailableHr = sessions.reduce((s, r) => s + r.totalHours, 0)
  const totalDowntimeMin = breakdowns.reduce((s, b) => s + b.breakTimeMin, 0)
  const totalDowntimeHr  = totalDowntimeMin / 60
  const totalUptimeHr    = Math.max(0, totalAvailableHr - totalDowntimeHr)
  const failureCount     = breakdowns.length

  return {
    machineId,
    period: { start: startDate, end: endDate },
    totalAvailableHr: round2(totalAvailableHr),
    totalDowntimeHr:  round2(totalDowntimeHr),
    totalUptimeHr:    round2(totalUptimeHr),
    failureCount,
    mtbf: failureCount > 0 ? round2(totalUptimeHr / failureCount) : round2(totalAvailableHr),
    mttr: failureCount > 0 ? round2(totalDowntimeHr / failureCount) : 0,
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
