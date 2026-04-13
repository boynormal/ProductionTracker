import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const bulkUpdateSchema = z.object({
  ids:    z.array(z.string()).min(1),
  isRead: z.boolean(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isRead = searchParams.get('isRead')
  const page   = parseInt(searchParams.get('page') ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '20')

  const where: any = {}
  if (isRead === 'true') where.isRead = true
  if (isRead === 'false') where.isRead = false

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ])

  return NextResponse.json({
    data: notifications,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json()
  const parsed = bulkUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { ids, isRead } = parsed.data

  const result = await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { isRead },
  })

  return NextResponse.json({ data: { updated: result.count } })
}
