import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkPermissionForSession } from '@/lib/permissions/guard'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lineId  = searchParams.get('lineId')
  const search  = searchParams.get('search')
  const page    = parseInt(searchParams.get('page') ?? '1')
  const limit   = parseInt(searchParams.get('limit') ?? '20')

  const where: any = { isActive: true }
  if (lineId) where.lineId = lineId
  if (search) where.OR = [
    { mcNo: { contains: search, mode: 'insensitive' } },
    { mcName: { contains: search, mode: 'insensitive' } },
  ]

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      include: {
        line: true,
        images: { where: { isPrimary: true }, take: 1 },
        partTargets: { where: { isActive: true }, select: { id: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { mcNo: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.machine.count({ where }),
  ])

  return NextResponse.json({
    data: machines,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const machine = await prisma.machine.create({ data: body })
  return NextResponse.json({ data: machine }, { status: 201 })
}
