import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { partSchema } from '@/lib/validations/master'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    const where: any = { isActive: true }
    if (customerId) where.customerId = customerId
    if (search) where.OR = [
      { partNo: { contains: search, mode: 'insensitive' } },
      { partName: { contains: search, mode: 'insensitive' } },
    ]

    const [parts, total] = await Promise.all([
      prisma.part.findMany({
        where,
        include: { customer: true },
        orderBy: { partSamco: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.part.count({ where }),
    ])

    return NextResponse.json({
      data: parts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('GET /api/master/parts error:', error)
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
    const parsed = partSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const part = await prisma.part.create({ data: parsed.data })
    return NextResponse.json({ data: part }, { status: 201 })
  } catch (error) {
    console.error('POST /api/master/parts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
