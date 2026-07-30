import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyScanOperatorToken, SCAN_COOKIE_NAME } from '@/lib/scan-session'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        employeeCode: { label: 'Employee Code', type: 'text' },
        password:     { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.employeeCode || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { employeeCode: credentials.employeeCode as string },
        })

        if (!user || !user.isActive) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        )
        if (!isValid) return null

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id:           user.id,
          employeeCode: user.employeeCode,
          name:         `${user.firstName} ${user.lastName}`,
          email:        user.email ?? undefined,
          role:         user.role,
        }
      },
    }),
  ],
  callbacks: {
    /**
     * Middleware / edge: กำหนดว่า path ไหนเข้าได้โดยไม่มี session
     * - /scan/* = QR เข้าเครื่อง — ไม่ใช้ NextAuth ก่อน (ยืนยันด้วย PIN ในหน้า)
     */
    async authorized({ auth, request }) {
      const p = request.nextUrl.pathname
      if (p.startsWith('/scan')) return true
      if (p.startsWith('/api/scan')) return true
      if (p.startsWith('/login')) return true
      if (p.startsWith('/api/auth')) return true
      if (p.startsWith('/api/notifications/check')) return true
      /** Cron / scheduler: POST + Bearer / HMAC — auth ใน route handler */
      if (p === '/api/production/sessions/auto-close') return true
      if (auth?.user) return true

      /** QR สาย: เปิดหน้าบันทึกได้ก่อน — กรอกรหัสพนักงานในหน้า (ไม่บังคับ user/pass NextAuth) */
      if (p === '/production/record' && request.nextUrl.searchParams.has('lineId')) {
        return true
      }

      // QR → PIN → บันทึกผลิต โดยไม่ล็อกอิน NextAuth (มี HttpOnly JWT cookie)
      if (
        p.startsWith('/production/record') ||
        p.startsWith('/api/production/sessions') ||
        p.startsWith('/api/production/records')
      ) {
        const raw = request.cookies.get(SCAN_COOKIE_NAME)?.value
        if (raw && (await verifyScanOperatorToken(raw))) return true
      }

      return false
    },
    async jwt({ token, user }) {
      if (user) {
        token.id           = user.id
        token.employeeCode = (user as { employeeCode?: string }).employeeCode
        token.role         = (user as { role?: string }).role
      }
      // Re-validate on token refresh so deactivate/demote revoke access before JWT expiry.
      if (typeof token.id === 'string') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, isActive: true, employeeCode: true },
        })
        if (!dbUser?.isActive) return null
        token.role = dbUser.role
        token.employeeCode = dbUser.employeeCode
      }
      return token
    },
    async session({ session, token }) {
      if (typeof token.id !== 'string') {
        // Invalidate identity when jwt callback cleared the token (deactivated user).
        delete (session as { user?: unknown }).user
        return session
      }
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: { role: true, isActive: true, employeeCode: true },
      })
      if (!dbUser?.isActive) {
        delete (session as { user?: unknown }).user
        return session
      }
      session.user.id           = token.id
      session.user.employeeCode = dbUser.employeeCode
      session.user.role         = dbUser.role
      return session
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  // updateAge: 0 forces jwt refresh on each session read so isActive/role stay current.
  session: { strategy: 'jwt', updateAge: 0 },
})
