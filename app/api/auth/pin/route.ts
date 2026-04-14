import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  signScanOperatorToken,
  SCAN_COOKIE_NAME,
  SCAN_COOKIE_MAX_AGE_SEC,
} from '@/lib/scan-session'
import {
  checkPinRateLimit,
  pinRateLimitKey,
  pinRateLimitKeyPinOnly,
  registerPinFailure,
  registerPinSuccess,
} from '@/lib/security/pin-rate-limit'

const userPinSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  pin: true,
} satisfies Prisma.UserSelect

type UserPinLogin = Prisma.UserGetPayload<{ select: typeof userPinSelect }>

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const employeeCodeRaw = typeof body.employeeCode === 'string' ? body.employeeCode.trim() : ''
    const normalizedPin = typeof body.pin === 'string' ? body.pin.trim() : ''
    if (!normalizedPin) {
      return NextResponse.json({ error: 'กรุณากรอก PIN' }, { status: 400 })
    }

    const useEmployeeCode = employeeCodeRaw.length > 0
    const rateKey = useEmployeeCode
      ? pinRateLimitKey(req, employeeCodeRaw)
      : pinRateLimitKeyPinOnly(req)
    const guard = checkPinRateLimit(rateKey)
    if (!guard.allowed) {
      return NextResponse.json(
        { error: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง', retryAfterSec: guard.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(guard.retryAfterSec) } },
      )
    }

    let user: UserPinLogin

    if (useEmployeeCode) {
      const found = await prisma.user.findUnique({
        where: { employeeCode: employeeCodeRaw },
        select: userPinSelect,
      })
      if (!found || !found.isActive) {
        registerPinFailure(rateKey)
        return NextResponse.json({ error: 'ไม่พบรหัสพนักงาน' }, { status: 404 })
      }
      if (!found.pin || found.pin.trim().length === 0) {
        registerPinFailure(rateKey)
        return NextResponse.json({ error: 'บัญชีนี้ยังไม่ได้ตั้ง PIN กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 })
      }
      if (normalizedPin !== found.pin) {
        registerPinFailure(rateKey)
        return NextResponse.json({ error: 'PIN ไม่ถูกต้อง' }, { status: 401 })
      }
      user = found
    } else {
      const matches = await prisma.user.findMany({
        where: { pin: normalizedPin, isActive: true },
        select: userPinSelect,
      })
      if (matches.length === 0) {
        registerPinFailure(rateKey)
        return NextResponse.json({ error: 'PIN ไม่ถูกต้อง' }, { status: 401 })
      }
      if (matches.length > 1) {
        console.error('PIN login: multiple active users share the same PIN; enforce uniqueness in admin.')
        registerPinFailure(rateKey)
        return NextResponse.json(
          { error: 'ระบบตรวจพบ PIN ซ้ำ กรุณาติดต่อผู้ดูแลระบบ' },
          { status: 409 },
        )
      }
      user = matches[0]!
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PIN_LOGIN',
        entity: 'users',
        entityId: user.id,
        details: { pinProvided: true },
      },
    })

    const token = await signScanOperatorToken(user.id)
    const { pin: _pin, ...safeUser } = user
    const res = NextResponse.json({ data: safeUser })
    registerPinSuccess(rateKey)
    res.cookies.set(SCAN_COOKIE_NAME, token, {
      httpOnly: true,
      secure:  process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   SCAN_COOKIE_MAX_AGE_SEC,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** ออกจากโหมดสแกน (ล้าง cookie) */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SCAN_COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return res
}
