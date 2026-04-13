import sharp from 'sharp'

/** ด้านยาวสูงสุด (px) — ลดขนาดไฟล์และเหมาะกับการดูบนหน้าจอ */
const MAX_LONG_EDGE = 1920
const WEBP_QUALITY = 82

/**
 * หมุนตาม EXIF, ย่อให้พอดีในกรอบ MAX_LONG_EDGE, บันทึกเป็น WebP
 */
export async function compressMachineImageForUpload(input: Buffer): Promise<Buffer> {
  const img = sharp(input).rotate()
  const meta = await img.metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const needsResize = w > MAX_LONG_EDGE || h > MAX_LONG_EDGE
  const pipeline = needsResize
    ? img.resize(MAX_LONG_EDGE, MAX_LONG_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    : img

  return pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer()
}
