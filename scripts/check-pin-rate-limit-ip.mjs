/**
 * Targeted regression: PIN rate-limit IP must not prefer spoofable leftmost XFF.
 * Run: node scripts/check-pin-rate-limit-ip.mjs
 */
import assert from 'node:assert/strict'

function clientIpFromRequest(req) {
  const nextIp = typeof req.ip === 'string' ? req.ip.trim() : ''
  if (nextIp) return nextIp

  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return 'unknown'
}

function fakeReq({ ip, headers = {} } = {}) {
  return {
    ip,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null
      },
    },
  }
}

assert.equal(
  clientIpFromRequest(fakeReq({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })),
  '10.0.0.1',
  'must use rightmost XFF hop (proxy-appended), not client-spoofed leftmost',
)

assert.equal(
  clientIpFromRequest(fakeReq({ headers: { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '10.1.2.3' } })),
  '10.1.2.3',
  'X-Real-IP must win over XFF',
)

assert.equal(
  clientIpFromRequest(fakeReq({ ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.1.1.1' } })),
  '203.0.113.9',
  'platform req.ip must win over headers',
)

assert.equal(
  clientIpFromRequest(fakeReq({ headers: { 'x-forwarded-for': '   ,  ,  ' } })),
  'unknown',
)

console.log('ok: client IP extraction rejects leftmost XFF spoofing')
