import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { machinePartTargetSchema } from '@/lib/validations/master'
import { parseThaiCalendarDateUtc } from '@/lib/time-utils'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const machineId = searchParams.get('machineId')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    const where: any = { isActive: true }
    if (machineId) where.machineId = machineId

    const [targets, total] = await Promise.all([
      prisma.machinePartTarget.findMany({
        where,
        include: {
          machine: { select: { id: true, mcNo: true, mcName: true } },
          part: { include: { customer: true } },
        },
        orderBy: { part: { partSamco: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.machinePartTarget.count({ where }),
    ])

    return NextResponse.json({
      data: targets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('GET /api/master/machine-part-targets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'ENGINEER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = machinePartTargetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { effectiveDate: ev, ...rest } = parsed.data
    const effectiveDate =
      ev == null || ev === undefined
        ? undefined
        : typeof ev === 'string'
          ? (parseThaiCalendarDateUtc(ev) ?? new Date(`${ev}T12:00:00.000Z`))
          : ev
    const target = await prisma.machinePartTarget.create({
      data: { ...rest, ...(effectiveDate !== undefined ? { effectiveDate } : {}) },
    })
    return NextResponse.json({ data: target }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          error:
            'มีแถวซ้ำสำหรับเครื่อง+Part+วันที่มีผลแล้ว — แก้ไขแถวเดิมหรือใช้วันที่มีผลคนละค่า',
        },
        { status: 409 },
      )
    }
    console.error('POST /api/master/machine-part-targets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
