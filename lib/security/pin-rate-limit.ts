import type { NextRequest } from 'next/server'
import { clientIpFromRequest } from '@/lib/security/client-ip'

type Entry = {
  attempts: number
  windowStartMs: number
  blockedUntilMs: number
}

const store = new Map<string, Entry>()

const MAX_ATTEMPTS = Number(process.env.PIN_LOGIN_MAX_ATTEMPTS ?? 5)
const WINDOW_MS = Number(process.env.PIN_LOGIN_WINDOW_SEC ?? 300) * 1000
const BLOCK_MS = Number(process.env.PIN_LOGIN_BLOCK_SEC ?? 900) * 1000

/** Process-wide cap for PIN-only guesses — stops distributed / spoofed IP spraying of the 4-digit space. */
const PIN_ONLY_GLOBAL_KEY = 'pin-only|global'
const PIN_ONLY_GLOBAL_MAX = Number(process.env.PIN_LOGIN_GLOBAL_MAX_ATTEMPTS ?? 20)
const PIN_ONLY_GLOBAL_WINDOW_MS = Number(process.env.PIN_LOGIN_GLOBAL_WINDOW_SEC ?? 300) * 1000
const PIN_ONLY_GLOBAL_BLOCK_MS = Number(process.env.PIN_LOGIN_GLOBAL_BLOCK_SEC ?? 900) * 1000

function nowMs() {
  return Date.now()
}

function normalize(entry: Entry, now: number, windowMs: number): Entry {
  if (entry.blockedUntilMs > now) return entry
  if (now - entry.windowStartMs > windowMs) {
    return { attempts: 0, windowStartMs: now, blockedUntilMs: 0 }
  }
  return entry
}

export function pinRateLimitKey(req: NextRequest, employeeCode: string): string {
  return `${employeeCode.trim().toLowerCase()}|${clientIpFromRequest(req)}`
}

/** Rate limit สำหรับเข้าด้วย PIN อย่างเดียว — นับต่อ IP (กันสุ่ม PIN ทั้งช่อง 10,000) */
export function pinRateLimitKeyPinOnly(req: NextRequest): string {
  return `pin-only|${clientIpFromRequest(req)}`
}

export function checkPinRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = nowMs()
  const current = store.get(key)
  if (!current) return { allowed: true, retryAfterSec: 0 }
  const entry = normalize(current, now, WINDOW_MS)
  store.set(key, entry)

  if (entry.blockedUntilMs > now) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000))
    return { allowed: false, retryAfterSec }
  }
  return { allowed: true, retryAfterSec: 0 }
}

/** Global PIN-only budget (in addition to per-IP). Call for pin-only login path. */
export function checkPinOnlyGlobalRateLimit(): { allowed: boolean; retryAfterSec: number } {
  const now = nowMs()
  const current = store.get(PIN_ONLY_GLOBAL_KEY)
  if (!current) return { allowed: true, retryAfterSec: 0 }
  const entry = normalize(current, now, PIN_ONLY_GLOBAL_WINDOW_MS)
  store.set(PIN_ONLY_GLOBAL_KEY, entry)

  if (entry.blockedUntilMs > now) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000))
    return { allowed: false, retryAfterSec }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function registerPinFailure(key: string): void {
  const now = nowMs()
  const current = normalize(store.get(key) ?? { attempts: 0, windowStartMs: now, blockedUntilMs: 0 }, now, WINDOW_MS)
  const attempts = current.attempts + 1
  const blockedUntilMs = attempts >= MAX_ATTEMPTS ? now + BLOCK_MS : 0
  store.set(key, {
    attempts,
    windowStartMs: current.windowStartMs || now,
    blockedUntilMs,
  })
}

export function registerPinOnlyGlobalFailure(): void {
  const now = nowMs()
  const current = normalize(
    store.get(PIN_ONLY_GLOBAL_KEY) ?? { attempts: 0, windowStartMs: now, blockedUntilMs: 0 },
    now,
    PIN_ONLY_GLOBAL_WINDOW_MS,
  )
  const attempts = current.attempts + 1
  const blockedUntilMs = attempts >= PIN_ONLY_GLOBAL_MAX ? now + PIN_ONLY_GLOBAL_BLOCK_MS : 0
  store.set(PIN_ONLY_GLOBAL_KEY, {
    attempts,
    windowStartMs: current.windowStartMs || now,
    blockedUntilMs,
  })
}

export function registerPinSuccess(key: string): void {
  store.delete(key)
}
