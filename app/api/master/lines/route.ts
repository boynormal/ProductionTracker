import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sanitizeCrudSelectIds } from '@/lib/crud-select'
import { divisionCodeForSectionId } from '@/lib/line-division'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { lineSchema } from '@/lib/validations/master'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const sectionId = searchParams.get('sectionId')
    const divisionCode = searchParams.get('divisionCode')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    const where: any = { isActive: true }
    if (sectionId) where.sectionId = sectionId
    if (divisionCode) where.divisionCode = divisionCode
    if (search) where.OR = [
      { lineCode: { contains: search, mode: 'insensitive' } },
      { lineName: { contains: search, mode: 'insensitive' } },
    ]

    const [lines, total] = await Promise.all([
      prisma.line.findMany({
        where,
        include: {
          section: true,
          _count: { select: { machines: true } },
        },
        orderBy: { lineCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.line.count({ where }),
    ])

    return NextResponse.json({
      data: lines,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('GET /api/master/lines error:', error)
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
    const raw = (await req.json()) as Record<string, unknown>
    const body = sanitizeCrudSelectIds(raw)
    const parsed = lineSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (parsed.data.sectionId) {
      const sec = await prisma.section.findFirst({
        where: { id: parsed.data.sectionId, isActive: true, ...sectionWhereMasterList },
      })
      if (!sec) {
        return NextResponse.json(
          { error: 'Section ไม่อยู่ในรายการที่อนุญาต — ใช้เฉพาะส่วนที่แสดงใน master/departments' },
          { status: 400 },
        )
      }
    }

    const divisionCode = await divisionCodeForSectionId(parsed.data.sectionId ?? null)
    const line = await prisma.line.create({
      data: { ...parsed.data, divisionCode },
    })
    return NextResponse.json({ data: line }, { status: 201 })
  } catch (error) {
    console.error('POST /api/master/lines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
