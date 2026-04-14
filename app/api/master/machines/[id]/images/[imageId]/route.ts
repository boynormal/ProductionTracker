import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteMachineImageFileIfLocal } from '@/lib/machine-image-storage'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string; imageId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: machineId, imageId } = await params
  const body = await req.json().catch(() => ({}))
  if (body?.isPrimary !== true) {
    return NextResponse.json({ error: 'isPrimary: true required' }, { status: 400 })
  }

  const img = await prisma.machineImage.findFirst({
    where: { id: imageId, machineId },
  })
  if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.machineImage.updateMany({ where: { machineId }, data: { isPrimary: false } }),
    prisma.machineImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ])

  const updated = await prisma.machineImage.findUnique({ where: { id: imageId } })
  return NextResponse.json({ data: updated })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: machineId, imageId } = await params
  const img = await prisma.machineImage.findFirst({
    where: { id: imageId, machineId },
  })
  if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deleteMachineImageFileIfLocal(img.url)
  await prisma.machineImage.delete({ where: { id: imageId } })

  return NextResponse.json({ ok: true })
}
