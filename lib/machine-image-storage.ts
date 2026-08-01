import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export {
  MACHINE_IMAGE_MAX_COUNT,
  MACHINE_IMAGE_MAX_BYTES,
  MACHINE_IMAGE_MIME_EXT,
  isAllowedMachineImageMime,
} from '@/lib/machine-image-config'

const UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads')

function isPathInsideUploads(resolvedPath: string): boolean {
  const root = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : `${UPLOADS_ROOT}${path.sep}`
  return resolvedPath === UPLOADS_ROOT || resolvedPath.startsWith(root)
}

/** Machine ids used in upload paths must be simple path segments (cuid/uuid-safe). */
export function assertSafeUploadMachineId(machineId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(machineId)) {
    throw new Error('Invalid machine id for upload path')
  }
  return machineId
}

/**
 * Map a public `/uploads/...` URL to an absolute file under `public/uploads`.
 * Returns null for anything that escapes that directory (path traversal).
 */
export function resolveSafeLocalUploadPath(publicUrl: string): string | null {
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) return null
  if (publicUrl.includes('\0') || publicUrl.includes('\\') || publicUrl.includes('..')) return null

  const relative = publicUrl.slice(1) // strip leading /
  const resolved = path.resolve(process.cwd(), 'public', relative)
  if (!isPathInsideUploads(resolved)) return null
  return resolved
}

export function publicPathForMachineUpload(machineId: string, filename: string): string {
  const safeId = assertSafeUploadMachineId(machineId)
  if (!/^[a-zA-Z0-9._-]{1,180}$/.test(filename) || filename.includes('..')) {
    throw new Error('Invalid upload filename')
  }
  return `/uploads/machines/${safeId}/${filename}`
}

export async function writeMachineImageFile(
  machineId: string,
  buffer: Buffer,
  ext: string,
): Promise<{ publicUrl: string; absolutePath: string }> {
  const safeId = assertSafeUploadMachineId(machineId)
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'jpg'
  const filename = `${randomUUID()}.${safeExt}`
  const dir = path.resolve(UPLOADS_ROOT, 'machines', safeId)
  if (!isPathInsideUploads(dir)) {
    throw new Error('Upload directory escapes uploads root')
  }
  await mkdir(dir, { recursive: true })
  const absolutePath = path.join(dir, filename)
  if (!isPathInsideUploads(absolutePath)) {
    throw new Error('Upload path escapes uploads root')
  }
  await writeFile(absolutePath, buffer)
  return { publicUrl: publicPathForMachineUpload(safeId, filename), absolutePath }
}

/** ลบไฟล์ใต้ public/uploads เท่านั้น — ปฏิเสธ path traversal */
export async function deleteMachineImageFileIfLocal(publicUrl: string): Promise<void> {
  const fp = resolveSafeLocalUploadPath(publicUrl)
  if (!fp) return
  await unlink(fp).catch(() => {})
}
