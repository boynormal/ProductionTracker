import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { userUpdateSchema } from '@/lib/validations/master'
import { auditUserIdFromSession } from '@/lib/audit-user'
import bcrypt from 'bcryptjs'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { isPinUsedByAnotherUser } from '@/lib/user-pin-uniqueness'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    include: { department: true, division: true, section: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { passwordHash, ...safeUser } = user
  return NextResponse.json({ data: safeUser })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.admin.users.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json()
  const parsed = userUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { password, capablePartIds, ...rest } = parsed.data

  const updateData: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(rest)) {
    if (val === undefined) continue
    if (key === 'departmentId' || key === 'divisionId' || key === 'sectionId') {
      updateData[key] = val === '' ? null : val
      continue
    }
    updateData[key] = val
  }
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10)
  }

  const nextPin = updateData.pin
  if (typeof nextPin === 'string' && nextPin.trim() !== '') {
    if (await isPinUsedByAnotherUser(nextPin, id)) {
      return NextResponse.json({ error: 'รหัส PIN นี้ถูกใช้โดยผู้ใช้อื่นแล้ว' }, { status: 409 })
    }
  }

  try {
    const user = await prisma.$transaction(async tx => {
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id },
          data: updateData as object,
        })
      }
      if (capablePartIds !== undefined) {
        await tx.userPartCapability.deleteMany({ where: { userId: id } })
        if (capablePartIds.length > 0) {
          await tx.userPartCapability.createMany({
            data: capablePartIds.map(partId => ({ userId: id, partId })),
            skipDuplicates: true,
          })
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { department: true, division: true, section: true, capableParts: { include: { part: true } } },
      })
    })

    const { passwordHash, ...safeUser } = user

    const auditUid = await auditUserIdFromSession(session)
    await prisma.auditLog.create({
      data: {
        userId: auditUid,
        action: 'UPDATE_USER',
        entity: 'users',
        entityId: id,
      },
    })

    return NextResponse.json({ data: safeUser })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    console.error('PUT /api/admin/users/[id]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.admin.users.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  })

  const auditUidDel = await auditUserIdFromSession(session)
  await prisma.auditLog.create({
    data: {
      userId: auditUidDel,
      action: 'DEACTIVATE_USER',
      entity: 'users',
      entityId: id,
    },
  })

  return NextResponse.json({ message: 'User deactivated' })
}
