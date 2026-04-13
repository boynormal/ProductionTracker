/** ใช้ได้ทั้ง server/client — ห้าม import fs ที่นี่ */
export const MACHINE_IMAGE_MAX_COUNT = 5
export const MACHINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const MACHINE_IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function isAllowedMachineImageMime(m: string): m is keyof typeof MACHINE_IMAGE_MIME_EXT {
  return m in MACHINE_IMAGE_MIME_EXT
}
