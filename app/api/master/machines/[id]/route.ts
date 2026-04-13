import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { machinePatchSchema } from '@/lib/validations/master'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const machine = await prisma.machine.findUnique({
      where: { id },
      include: {
        line: true,
        partTargets: {
          where: { isActive: true },
          include: { part: { include: { customer: true } } },
          orderBy: { part: { partSamco: 'asc' } },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 5,
        },
      },
    })
    if (!machine) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: machine })
  } catch (error) {
    console.error('GET /api/master/machines/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'ENGINEER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = machinePatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = { ...parsed.data } as Record<string, unknown>
    for (const key of [
      'purchaseDate',
      'installDate',
      'lastMaintenanceDate',
      'nextMaintenanceDate',
      'warrantyExpiry',
    ] as const) {
      if (!(key in data)) continue
      const v = data[key]
      if (v === null || v === '') data[key] = null
      else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        data[key] = new Date(`${v}T12:00:00.000Z`)
      }
    }

    const machine = await prisma.machine.update({ where: { id }, data: data as object })
    return NextResponse.json({ data: machine })
  } catch (error) {
    console.error('PUT /api/master/machines/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'ENGINEER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const machine = await prisma.machine.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ data: machine })
  } catch (error) {
    console.error('DELETE /api/master/machines/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
