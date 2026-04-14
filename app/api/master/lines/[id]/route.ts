import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sanitizeCrudSelectIds } from '@/lib/crud-select'
import { divisionCodeForSectionId } from '@/lib/line-division'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { lineSchema } from '@/lib/validations/master'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const line = await prisma.line.findUnique({
      where: { id },
      include: { section: true, machines: { where: { isActive: true } } },
    })
    if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: line })
  } catch (error) {
    console.error('GET /api/master/lines/[id] error:', error)
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
    const raw = (await req.json()) as Record<string, unknown>
    const body = sanitizeCrudSelectIds(raw)
    const parsed = lineSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const existingLine = await prisma.line.findUnique({
      where: { id },
      select: { sectionId: true },
    })
    if (!existingLine) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const sid = parsed.data.sectionId
    if (sid !== undefined && sid !== null && sid !== '') {
      const secInMaster = await prisma.section.findFirst({
        where: { id: sid, isActive: true, ...sectionWhereMasterList },
      })
      if (!secInMaster) {
        const existsAny = await prisma.section.findFirst({
          where: { id: sid, isActive: true },
        })
        const keepingLegacyOnly = existingLine.sectionId === sid && !!existsAny
        if (!keepingLegacyOnly) {
          return NextResponse.json(
            {
              error:
                'Section ไม่อยู่ในรายการที่อนุญาต — ใช้เฉพาะส่วนที่แสดงใน master/departments (หรือเลือก Section ใหม่จากรายการ)',
            },
            { status: 400 },
          )
        }
      }
    }

    let data: Record<string, unknown> = { ...parsed.data }
    if ('sectionId' in parsed.data) {
      data = {
        ...data,
        divisionCode: await divisionCodeForSectionId(parsed.data.sectionId ?? null),
      }
    }

    const line = await prisma.line.update({ where: { id }, data: data as any })
    return NextResponse.json({ data: line })
  } catch (error) {
    console.error('PUT /api/master/lines/[id] error:', error)
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
    const line = await prisma.line.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ data: line })
  } catch (error) {
    console.error('DELETE /api/master/lines/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
