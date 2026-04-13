import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOperatorContextFromApiRequest, getOperatorIdFromApiRequest } from '@/lib/operator-auth'
import { getCurrentShift } from '@/lib/utils/shift'
import { getThaiTodayUTC, parseThaiPickerDateToUTC, dayEndExclusiveUTC } from '@/lib/utils/thai-time'

export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  if (ctx.source === 'scan' && !searchParams.get('machineId') && !searchParams.get('lineId')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const machineId = searchParams.get('machineId')
  const date      = searchParams.get('date')
  const status    = searchParams.get('status')
  const lineId    = searchParams.get('lineId')
  const detailed  = searchParams.get('detailed') === '1'

  const where: any = {}
  if (machineId) where.machineId = machineId
  if (status) where.status = status
  if (lineId) where.lineId = lineId
  if (date) {
    const dayStart = parseThaiPickerDateToUTC(date)
    if (!dayStart) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    where.sessionDate = { gte: dayStart, lt: dayEndExclusiveUTC(dayStart) }
  }

  const include = detailed
    ? {
        machine:  true,
        line:     true,
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        hourlyRecords: {
          include: {
            breakdownLogs: true,
            ngLogs: true,
            part: { include: { customer: true } },
            operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
          },
          orderBy: { hourSlot: 'asc' as const },
        },
      }
    : {
        machine:  true,
        line:     true,
        operator: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        _count:   { select: { hourlyRecords: true } },
      }

  const sessions = await prisma.productionSession.findMany({
    where,
    include,
    orderBy: [{ sessionDate: 'desc' }, { shiftType: 'asc' }],
    take: detailed ? 500 : 50,
  })

  return NextResponse.json({ data: sessions })
}

export async function POST(req: NextRequest) {
  try {
    const operatorId = await getOperatorIdFromApiRequest(req)
    if (!operatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    if (!body.lineId) {
      return NextResponse.json({ error: 'lineId required' }, { status: 400 })
    }

    // ✅ ใช้เวลาไทย -- ไม่ขึ้นกับ timezone ของ server
    const sessionDate = getThaiTodayUTC()
    const shiftType   = getCurrentShift()

    // Session unique: 1 Line ต่อ 1 กะ ต่อ 1 วัน
    const existing = await prisma.productionSession.findUnique({
      where: {
        sessionDate_shiftType_lineId: {
          sessionDate,
          shiftType,
          lineId: body.lineId,
        },
      },
    })
    if (existing) return NextResponse.json({ error: 'Session ของ Line นี้เปิดอยู่แล้ว', data: existing }, { status: 409 })

    const totalHours = (body.normalHours ?? 8) + (body.otHours ?? 0)

    const created = await prisma.productionSession.create({
      data: {
        sessionDate,
        shiftType,
        lineId:      body.lineId,
        machineId:   body.machineId ?? null,
        operatorId,
        startTime:   new Date(),
        normalHours: body.normalHours ?? 8,
        otHours:     body.otHours ?? 0,
        totalHours,
      },
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/production/sessions error:', e)
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 })
  }
}
