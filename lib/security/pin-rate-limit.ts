import type { NextRequest } from 'next/server'

type Entry = {
  attempts: number
  windowStartMs: number
  blockedUntilMs: number
}

const store = new Map<string, Entry>()

const MAX_ATTEMPTS = Number(process.env.PIN_LOGIN_MAX_ATTEMPTS ?? 5)
const WINDOW_MS = Number(process.env.PIN_LOGIN_WINDOW_SEC ?? 300) * 1000
const BLOCK_MS = Number(process.env.PIN_LOGIN_BLOCK_SEC ?? 900) * 1000

function nowMs() {
  return Date.now()
}

function normalize(entry: Entry, now: number): Entry {
  if (entry.blockedUntilMs > now) return entry
  if (now - entry.windowStartMs > WINDOW_MS) {
    return { attempts: 0, windowStartMs: now, blockedUntilMs: 0 }
  }
  return entry
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

export function pinRateLimitKey(req: NextRequest, employeeCode: string): string {
  return `${employeeCode.trim().toLowerCase()}|${clientIp(req)}`
}

/** Rate limit สำหรับเข้าด้วย PIN อย่างเดียว — นับต่อ IP (กันสุ่ม PIN ทั้งช่อง 10,000) */
export function pinRateLimitKeyPinOnly(req: NextRequest): string {
  return `pin-only|${clientIp(req)}`
}

export function checkPinRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = nowMs()
  const current = store.get(key)
  if (!current) return { allowed: true, retryAfterSec: 0 }
  const entry = normalize(current, now)
  store.set(key, entry)

  if (entry.blockedUntilMs > now) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000))
    return { allowed: false, retryAfterSec }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function registerPinFailure(key: string): void {
  const now = nowMs()
  const current = normalize(store.get(key) ?? { attempts: 0, windowStartMs: now, blockedUntilMs: 0 }, now)
  const attempts = current.attempts + 1
  const blockedUntilMs = attempts >= MAX_ATTEMPTS ? now + BLOCK_MS : 0
  store.set(key, {
    attempts,
    windowStartMs: current.windowStartMs || now,
    blockedUntilMs,
  })
}

export function registerPinSuccess(key: string): void {
  store.delete(key)
}

