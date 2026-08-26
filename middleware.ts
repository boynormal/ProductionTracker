import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * การยกเว้น login อยู่ที่ `lib/auth.ts` → callbacks.authorized
 * (รวม /scan/[machineId] + /api/scan — QR ใช้ PIN ในหน้า ไม่บังคับ session ก่อน)
 *
 * x-allow-record-line-qr ต้องมาจาก middleware เท่านั้น — ลบค่าจาก client ก่อน
 * แล้วตั้งใหม่เฉพาะ /production/record?lineId= (กัน spoof ข้าม layout auth)
 */
export default auth((req) => {
  const requestHeaders = new Headers(req.headers)
  // Strip client-controlled copies; only middleware may assert these.
  requestHeaders.delete('x-allow-record-line-qr')
  requestHeaders.delete('x-middleware-pathname')
  const u = req.nextUrl
  requestHeaders.set('x-middleware-pathname', u.pathname)
  if (u.pathname === '/production/record' && u.searchParams.has('lineId')) {
    requestHeaders.set('x-allow-record-line-qr', '1')
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
