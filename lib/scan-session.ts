import { SignJWT, jwtVerify } from 'jose'

/** HttpOnly cookie หลังยืนยันรหัสพนักงานบนหน้า QR — ไม่ต้อง NextAuth session */
export const SCAN_COOKIE_NAME = 'pt_scan_operator'

/** สูงสุด 11 ชม. ตามกะ + OT */
export const SCAN_COOKIE_MAX_AGE_SEC = 11 * 60 * 60

function getSecretKey() {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET (หรือ AUTH_SECRET) จำเป็นสำหรับ scan session')
  return new TextEncoder().encode(s)
}

export async function signScanOperatorToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SCAN_COOKIE_MAX_AGE_SEC}s`)
    .sign(getSecretKey())
}

export async function verifyScanOperatorToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
