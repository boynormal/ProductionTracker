import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compressMachineImageForUpload } from '@/lib/machine-image-compress'
import {
  MACHINE_IMAGE_MAX_BYTES,
  MACHINE_IMAGE_MAX_COUNT,
  isAllowedMachineImageMime,
  writeMachineImageFile,
} from '@/lib/machine-image-storage'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: machineId } = await params
  const exists = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const images = await prisma.machineImage.findMany({
    where: { machineId },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: MACHINE_IMAGE_MAX_COUNT,
  })
  return NextResponse.json({ data: images })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: machineId } = await params
  const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } })
  if (!machine) return NextResponse.json({ error: 'Machine not found' }, { status: 404 })

  const count = await prisma.machineImage.count({ where: { machineId } })
  if (count >= MACHINE_IMAGE_MAX_COUNT) {
    return NextResponse.json({ error: `อัปโหลดได้สูงสุด ${MACHINE_IMAGE_MAX_COUNT} รูปต่อเครื่อง` }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const mime = file.type || 'application/octet-stream'
  if (!isAllowedMachineImageMime(mime)) {
    return NextResponse.json({ error: 'ใช้ได้เฉพาะ JPEG, PNG, WebP' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > MACHINE_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, { status: 400 })
  }

  let outBuf: Buffer
  try {
    outBuf = await compressMachineImageForUpload(buf)
  } catch {
    return NextResponse.json({ error: 'ไฟล์รูปเสียหรืออ่านไม่ได้' }, { status: 400 })
  }
  if (outBuf.length > MACHINE_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: 'หลังบีบอัดไฟล์ยังใหญ่เกิน 5 MB' }, { status: 400 })
  }

  // เก็บเป็น WebP เสมอหลังประมวลผล — โหลดเร็ว ขนาดเล็ก
  const captionRaw = formData.get('caption')
  const caption = typeof captionRaw === 'string' && captionRaw.trim() ? captionRaw.trim().slice(0, 200) : null
  const wantPrimary = formData.get('setPrimary') === 'true' || formData.get('setPrimary') === 'on'
  const firstImage = count === 0

  const { publicUrl } = await writeMachineImageFile(machineId, outBuf, 'webp')

  const maxOrder = await prisma.machineImage.aggregate({
    where: { machineId },
    _max: { sortOrder: true },
  })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1
  const makePrimary = wantPrimary || firstImage

  const created = await prisma.$transaction(async tx => {
    if (makePrimary) {
      await tx.machineImage.updateMany({ where: { machineId }, data: { isPrimary: false } })
    }
    return tx.machineImage.create({
      data: {
        machineId,
        url: publicUrl,
        caption,
        sortOrder,
        isPrimary: makePrimary,
      },
    })
  })

  return NextResponse.json({ data: created }, { status: 201 })
}
