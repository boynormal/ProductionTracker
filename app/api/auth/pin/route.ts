import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  signScanOperatorToken,
  SCAN_COOKIE_NAME,
  SCAN_COOKIE_MAX_AGE_SEC,
} from '@/lib/scan-session'

export async function POST(req: NextRequest) {
  try {
    const { employeeCode } = await req.json()
    if (!employeeCode) return NextResponse.json({ error: 'กรุณากรอกรหัสพนักงาน' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { employeeCode },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, role: true, isActive: true },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'ไม่พบรหัสพนักงาน' }, { status: 404 })
    }

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'PIN_LOGIN', entity: 'users', entityId: user.id },
    })

    const token = await signScanOperatorToken(user.id)
    const res = NextResponse.json({ data: user })
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
