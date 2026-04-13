import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export {
  MACHINE_IMAGE_MAX_COUNT,
  MACHINE_IMAGE_MAX_BYTES,
  MACHINE_IMAGE_MIME_EXT,
  isAllowedMachineImageMime,
} from '@/lib/machine-image-config'

export function publicPathForMachineUpload(machineId: string, filename: string): string {
  return `/uploads/machines/${machineId}/${filename}`
}

export async function writeMachineImageFile(
  machineId: string,
  buffer: Buffer,
  ext: string,
): Promise<{ publicUrl: string; absolutePath: string }> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'jpg'
  const filename = `${randomUUID()}.${safeExt}`
  const relDir = path.join('public', 'uploads', 'machines', machineId)
  const dir = path.join(process.cwd(), relDir)
  await mkdir(dir, { recursive: true })
  const absolutePath = path.join(dir, filename)
  await writeFile(absolutePath, buffer)
  return { publicUrl: publicPathForMachineUpload(machineId, filename), absolutePath }
}

/** ลบไฟล์ใต้ public/uploads เท่านั้น */
export async function deleteMachineImageFileIfLocal(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith('/uploads/')) return
  const fp = path.join(process.cwd(), 'public', publicUrl.replace(/^\//, ''))
  await unlink(fp).catch(() => {})
}
