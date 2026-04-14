import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Cron / scheduler HTTP auth (used by GET handlers that external schedulers call).
 *
 * ผ่านได้ด้วยอย่างใดอย่างหนึ่ง:
 * 1) `Authorization: Bearer <CRON_SECRET>` — เปรียบเทียบแบบ timing-safe
 * 2) HMAC + IP allowlist — ตั้ง `CRON_HMAC_SECRET` + `CRON_IP_ALLOWLIST` (comma-separated)
 *    - Headers: `X-Cron-Timestamp` (unix seconds), `X-Cron-Signature` (hex ของ HMAC-SHA256)
 *    - Payload ที่ sign: `${timestamp}\\n${METHOD}\\n${pathname}` (pathname จาก URL ไม่รวม query)
 *
 * Env ที่เกี่ยวข้อง:
 * - CRON_SECRET — Bearer (เดิม)
 * - CRON_HMAC_SECRET, CRON_IP_ALLOWLIST — โหมด HMAC (ต้องมีทั้งคู่ถึงจะใช้ path นี้ได้)
 * - CRON_HMAC_SKEW_SEC — คลาดเวลาที่ยอมรับได้ (ค่าเริ่มต้น 300)
 */

function timingSafeStringEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m?.[1]?.trim() ?? null
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function isValidCronBearer(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const token = getBearerToken(req)
  if (!token) return false
  return timingSafeStringEq(secret, token)
}

function isValidCronHmac(req: NextRequest): boolean {
  const secret = process.env.CRON_HMAC_SECRET
  if (!secret) return false

  const tsStr = req.headers.get('x-cron-timestamp')
  const sigHeader = req.headers.get('x-cron-signature')
  if (!tsStr || !sigHeader) return false

  const ts = Number.parseInt(tsStr, 10)
  if (!Number.isFinite(ts) || ts <= 0) return false

  const skewSec = Number(process.env.CRON_HMAC_SKEW_SEC ?? 300)
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > skewSec) return false

  const method = req.method.toUpperCase()
  const path = req.nextUrl.pathname
  const payload = `${ts}\n${method}\n${path}`
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')

  let sig = sigHeader.trim().toLowerCase()
  const sha256p = /^sha256=([0-9a-f]+)$/.exec(sig)
  if (sha256p) sig = sha256p[1]!
  if (!/^[0-9a-f]{64}$/.test(sig)) return false

  return timingSafeStringEq(expected, sig)
}

function isClientIpInCronAllowlist(req: NextRequest): boolean {
  const list = parseAllowlist(process.env.CRON_IP_ALLOWLIST)
  if (list.length === 0) return false
  const ip = clientIp(req)
  return list.includes(ip)
}

/**
 * true ถ้าเป็น cron request ที่อนุญาต (Bearer หรือ HMAC+IP allowlist)
 */
export function isValidCronRequest(req: NextRequest): boolean {
  if (isValidCronBearer(req)) return true
  if (!isValidCronHmac(req)) return false
  return isClientIpInCronAllowlist(req)
}
