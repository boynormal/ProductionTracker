import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { machinePartTargetSchema } from '@/lib/validations/master'
import { parseThaiCalendarDateUtc } from '@/lib/time-utils'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const target = await prisma.machinePartTarget.findUnique({
      where: { id },
      include: {
        machine: { select: { id: true, mcNo: true, mcName: true } },
        part: { include: { customer: true } },
      },
    })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('GET /api/master/machine-part-targets/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = machinePartTargetSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = { ...parsed.data }
    if (data.effectiveDate !== undefined && typeof data.effectiveDate === 'string') {
      data.effectiveDate = parseThaiCalendarDateUtc(data.effectiveDate) ?? new Date(`${data.effectiveDate}T12:00:00.000Z`)
    }

    const target = await prisma.machinePartTarget.update({ where: { id }, data })
    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('PUT /api/master/machine-part-targets/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const target = await prisma.machinePartTarget.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('DELETE /api/master/machine-part-targets/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
