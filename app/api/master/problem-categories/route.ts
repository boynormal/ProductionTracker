import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { problemCategorySchema } from '@/lib/validations/master'
import { checkPermissionForSession } from '@/lib/permissions/guard'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    const where: any = { isActive: true }
    if (type && ['BREAKDOWN', 'NG'].includes(type)) where.type = type
    if (search) where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]

    const [categories, total] = await Promise.all([
      prisma.problemCategory.findMany({
        where,
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.problemCategory.count({ where }),
    ])

    return NextResponse.json({
      data: categories,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('GET /api/master/problem-categories error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parsed = problemCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const category = await prisma.problemCategory.create({ data: parsed.data })
    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    console.error('POST /api/master/problem-categories error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
