import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { userCreateSchema } from '@/lib/validations/master'
import { auditUserIdFromSession } from '@/lib/audit-user'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')
  const role         = searchParams.get('role')
  const search       = searchParams.get('search')
  const page         = parseInt(searchParams.get('page') ?? '1')
  const limit        = parseInt(searchParams.get('limit') ?? '20')

  const where: any = {}
  if (departmentId) where.departmentId = departmentId
  if (role) where.role = role
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        department: true,
        division: true,
        section: true,
      },
      orderBy: { employeeCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  const safeUsers = users.map(({ passwordHash, ...u }) => u)

  return NextResponse.json({
    data: safeUsers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body   = await req.json()
  const parsed = userCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { password, capablePartIds, ...data } = parsed.data

  const existing = await prisma.user.findUnique({ where: { employeeCode: data.employeeCode } })
  if (existing) return NextResponse.json({ error: 'รหัสพนักงานซ้ำ' }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.$transaction(async tx => {
    const u = await tx.user.create({
      data: { ...data, passwordHash },
    })
    if (capablePartIds?.length) {
      await tx.userPartCapability.createMany({
        data: capablePartIds.map(partId => ({ userId: u.id, partId })),
        skipDuplicates: true,
      })
    }
    return tx.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { department: true, division: true, section: true, capableParts: { include: { part: true } } },
    })
  })

  const { passwordHash: _, ...safeUser } = user

  const auditUid = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUid,
      action: 'CREATE_USER',
      entity: 'users',
      entityId: user.id,
    },
  })

  return NextResponse.json({ data: safeUser }, { status: 201 })
}
