import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { linePartTargetSchema } from '@/lib/validations/master'
import { parseThaiCalendarDateUtc } from '@/lib/time-utils'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string; targetId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: lineId, targetId } = await params
    const target = await prisma.linePartTarget.findFirst({
      where: { id: targetId, lineId },
      include: { part: { include: { customer: true } } },
    })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('GET line-part-targets/[targetId] error:', error)
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
    const { id: lineId, targetId } = await params
    const existing = await prisma.linePartTarget.findFirst({
      where: { id: targetId, lineId },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const parsed = linePartTargetSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data: Record<string, unknown> = { ...parsed.data }
    if (data.effectiveDate !== undefined && typeof data.effectiveDate === 'string') {
      data.effectiveDate =
        parseThaiCalendarDateUtc(data.effectiveDate as string) ??
        new Date(`${data.effectiveDate}T12:00:00.000Z`)
    }
    delete data.lineId
    delete data.partId

    const target = await prisma.linePartTarget.update({
      where: { id: targetId },
      data,
    })
    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('PUT line-part-targets/[targetId] error:', error)
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
    const { id: lineId, targetId } = await params
    const existing = await prisma.linePartTarget.findFirst({
      where: { id: targetId, lineId },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const target = await prisma.linePartTarget.update({
      where: { id: targetId },
      data: { isActive: false },
    })
    return NextResponse.json({ data: target })
  } catch (error) {
    console.error('DELETE line-part-targets/[targetId] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
