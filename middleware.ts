import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * การยกเว้น login อยู่ที่ `lib/auth.ts` → callbacks.authorized
 * (รวม /scan/[machineId] + /api/scan — QR ใช้ PIN ในหน้า ไม่บังคับ session ก่อน)
 */
export default auth((req) => {
  const requestHeaders = new Headers(req.headers)
  const u = req.nextUrl
  if (u.pathname === '/production/record' && u.searchParams.has('lineId')) {
    requestHeaders.set('x-allow-record-line-qr', '1')
  }
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
