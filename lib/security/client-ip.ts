import type { NextRequest } from 'next/server'

/**
 * Best-effort client IP for rate limiting.
 *
 * Do NOT use the leftmost X-Forwarded-For value — clients can set that header, and
 * common reverse-proxy configs append the real peer (`$proxy_add_x_forwarded_for`),
 * leaving the attacker-controlled address first. Prefer platform `req.ip`, then
 * `X-Real-IP`, then the rightmost XFF hop (closest proxy).
 */
export function clientIpFromRequest(req: NextRequest): string {
  // NextRequest.ip exists on some Next.js runtimes/platforms but is not in all type defs.
  const maybeIp = (req as NextRequest & { ip?: string | null }).ip
  const nextIp = typeof maybeIp === 'string' ? maybeIp.trim() : ''
  if (nextIp) return nextIp

  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]!
  }

  return 'unknown'
}
