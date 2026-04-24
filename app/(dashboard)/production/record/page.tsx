import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { getOperatorIdFromCookies } from '@/lib/operator-auth'
import { getCurrentShift } from '@/lib/utils/shift'
import { getThaiTodayUTC } from '@/lib/utils/thai-time'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { RecordClient } from './RecordLoader'

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{
    machineId?: string
    sessionId?: string
    partId?: string
    partTargetId?: string
    lineId?: string
  }>
}) {
  const sp = await searchParams
  const [session, operatorIdFromCookie] = await Promise.all([auth(), getOperatorIdFromCookies()])
  const operatorId = operatorIdFromCookie ?? undefined

  let lockedLine: { id: string; lineCode: string; lineName: string } | null = null
  if (sp.lineId) {
    const ln = await prisma.line.findFirst({
      where: { id: sp.lineId, isActive: true },
      select: { id: true, lineCode: true, lineName: true },
    })
    if (ln) lockedLine = ln
  }

  /** lineId ใน URL ไม่ถูกต้อง — ห้ามเปิดข้อมูลโดยไม่ล็อกอิน */
  if (sp.lineId && !lockedLine && !session?.user && !operatorId) {
    redirect('/login')
  }

  /** ยังไม่ยืนยันตัวตน — ไม่ส่งรายการเครื่อง/หมวดปัญหาใน HTML (รอกรอกรหัสพนักงาน)
   * รวมกรณี QR เครื่อง (ไม่มี lineId) ที่เปิดลิงก์บันทึกโดยตรงโดยไม่มี cookie สแกน */
  const requiresScanPin = Boolean(!session?.user && !operatorId)

  let defaultPartId = sp.partId
  if (!defaultPartId && sp.partTargetId) {
    const [mpt, lpt] = await Promise.all([
      prisma.machinePartTarget.findUnique({
        where: { id: sp.partTargetId },
        select: { partId: true },
      }),
      prisma.linePartTarget.findUnique({
        where: { id: sp.partTargetId },
        select: { partId: true },
      }),
    ])
    defaultPartId = mpt?.partId ?? lpt?.partId ?? undefined
  }

  const today = getThaiTodayUTC()
  const shift = getCurrentShift()

  const machines = requiresScanPin
    ? []
    : await prisma.machine.findMany({
        where: { isActive: true, ...(lockedLine ? { lineId: lockedLine.id } : {}) },
        include: {
          line: true,
          /** เฉพาะบันทึกใน Session วันนี้ + กะปัจจุบัน ที่ยัง IN_PROGRESS — ไม่ดึงเรคคอร์ดเก่าข้ามวัน */
          hourlyRecords: {
            where: {
              session: {
                sessionDate: today,
                shiftType: shift,
                status: 'IN_PROGRESS',
              },
            },
            take: 1,
            orderBy: [{ hourSlot: 'desc' }, { updatedAt: 'desc' }],
            include: {
              part: {
                select: {
                  partNo: true,
                  partSamco: true,
                },
              },
            },
          },
          partTargets: {
            where: { isActive: true },
            include: { part: { include: { customer: true } } },
            orderBy: { piecesPerHour: 'desc' },
          },
        },
        orderBy: { mcNo: 'asc' },
      })

  const problemCategories = requiresScanPin
    ? []
    : await prisma.problemCategory.findMany({
        where: { isActive: true },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      })

  const hourlyInclude = {
    hourlyRecords: {
      include: {
        part: { select: { partSamco: true, partName: true } },
      },
      orderBy: { hourSlot: 'asc' as const },
    },
  }

  let existingSession = null
  if (requiresScanPin) {
    existingSession = null
  } else if (sp.sessionId) {
    existingSession = await prisma.productionSession.findUnique({
      where: { id: sp.sessionId },
      include: hourlyInclude,
    })
  } else if (operatorId && lockedLine) {
    existingSession = await prisma.productionSession.findFirst({
      where: {
        lineId: lockedLine.id,
        sessionDate: today,
        shiftType: shift,
        status: 'IN_PROGRESS',
      },
      include: hourlyInclude,
    })
  } else if (sp.machineId && operatorId) {
    const m = machines.find((x) => x.id === sp.machineId)
    existingSession = m
      ? await prisma.productionSession.findFirst({
          where: {
            lineId: m.lineId,
            sessionDate: today,
            shiftType: shift,
            status: 'IN_PROGRESS',
          },
          include: hourlyInclude,
        })
      : null
  }

  const [lines, sections] = requiresScanPin
    ? [[], []]
    : await Promise.all([
        prisma.line.findMany({
          where: { isActive: true },
          include: {
            section: { select: { id: true, sectionCode: true, sectionName: true } },
          },
          orderBy: { lineCode: 'asc' },
        }),
        prisma.section.findMany({
          where: { isActive: true, ...sectionWhereMasterList },
          include: { division: { select: { divisionCode: true, divisionName: true } } },
          orderBy: { sectionCode: 'asc' },
        }),
      ])

  /** บันทึกล่าสุดต่อสาย (วันนี้ตามไทย — ทุกกะ IN_PROGRESS/COMPLETED) — แสดงในรายการเลือกสาย */
  let lineActivityByLineId: Record<
    string,
    {
      hourSlot: number
      okQty: number
      partSamco: number | null
      recordTime: string
      sessionShiftType: 'DAY' | 'NIGHT'
    }
  > = {}
  if (!requiresScanPin) {
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
      orderBy: [{ updatedAt: 'desc' }, { hourSlot: 'desc' }],
      take: 800,
    })
    for (const r of latestRows) {
      const lid = r.session.lineId
      if (lineActivityByLineId[lid] != null) continue
      const st = r.session.shiftType
      lineActivityByLineId[lid] = {
        hourSlot: r.hourSlot,
        okQty: r.okQty,
        partSamco: r.part?.partSamco ?? null,
        recordTime: r.recordTime.toISOString(),
        sessionShiftType: st === 'NIGHT' ? 'NIGHT' : 'DAY',
      }
    }
  }

  const lineTargetsList = requiresScanPin
    ? []
    : await prisma.linePartTarget.findMany({
        where: { isActive: true, line: { isActive: true } },
        include: { part: { include: { customer: true } } },
        orderBy: [{ lineId: 'asc' }, { part: { partSamco: 'asc' } }],
      })

  const linePartTargetsByLine: Record<string, unknown[]> = {}
  for (const row of lineTargetsList) {
    const lid = row.lineId
    if (!linePartTargetsByLine[lid]) linePartTargetsByLine[lid] = []
    linePartTargetsByLine[lid].push(row)
  }

  /** เลือกสายเริ่มต้นจาก QR ไลน์ หรือจาก QR เครื่อง (แมปเป็น lineId) */
  let initialLineId: string | undefined = lockedLine?.id
  if (!initialLineId && sp.machineId) {
    const m = machines.find((x) => x.id === sp.machineId)
    if (m) initialLineId = m.lineId
  }

  return (
    <RecordClient
      machines={JSON.parse(JSON.stringify(machines))}
      problemCategories={JSON.parse(JSON.stringify(problemCategories))}
      existingSession={existingSession ? JSON.parse(JSON.stringify(existingSession)) : null}
      lockedLine={lockedLine ? JSON.parse(JSON.stringify(lockedLine)) : null}
      requiresScanPin={requiresScanPin}
      initialLineId={initialLineId}
      defaultPartId={defaultPartId}
      operatorId={operatorId}
      lines={JSON.parse(JSON.stringify(lines))}
      sections={JSON.parse(JSON.stringify(sections))}
      linePartTargetsByLine={JSON.parse(JSON.stringify(linePartTargetsByLine))}
      lineActivityByLineId={JSON.parse(JSON.stringify(lineActivityByLineId))}
    />
  )
}
