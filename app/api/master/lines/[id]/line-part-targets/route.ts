import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { linePartTargetSchema } from '@/lib/validations/master'
import { parseThaiCalendarDateUtc } from '@/lib/time-utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: lineId } = await params
    const line = await prisma.line.findUnique({ where: { id: lineId } })
    if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const targets = await prisma.linePartTarget.findMany({
      where: { lineId },
      include: { part: { include: { customer: true } } },
      orderBy: { part: { partSamco: 'asc' } },
    })

    return NextResponse.json({ data: targets })
  } catch (error) {
    console.error('GET /api/master/lines/[id]/line-part-targets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'ENGINEER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id: lineId } = await params
    const line = await prisma.line.findUnique({ where: { id: lineId } })
    if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const parsed = linePartTargetSchema.safeParse({ ...body, lineId })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { effectiveDate: ev, cycleTimeMin, lineId: _lid, ...rest } = parsed.data
    const effectiveDate =
      ev == null || ev === undefined
        ? undefined
        : typeof ev === 'string'
          ? (parseThaiCalendarDateUtc(ev) ?? new Date(`${ev}T12:00:00.000Z`))
          : ev

    const target = await prisma.linePartTarget.create({
      data: {
        ...rest,
        lineId: parsed.data.lineId,
        ...(cycleTimeMin !== undefined ? { cycleTimeMin } : {}),
        ...(effectiveDate !== undefined ? { effectiveDate } : {}),
      },
    })
    return NextResponse.json({ data: target }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          error:
            'มีแถวซ้ำสำหรับสาย+Part+วันที่มีผลแล้ว — แก้ไขแถวเดิมหรือใช้วันที่มีผลคนละค่า',
        },
        { status: 409 },
      )
    }
    console.error('POST /api/master/lines/[id]/line-part-targets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
