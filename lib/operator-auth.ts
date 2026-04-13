import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyScanOperatorToken, SCAN_COOKIE_NAME } from '@/lib/scan-session'

export type OperatorAuthSource = 'nextauth' | 'scan'

export type OperatorContext = { operatorId: string; source: OperatorAuthSource }

async function resolveOperatorContext(
  getRawCookie: () => string | undefined
): Promise<OperatorContext | null> {
  const session = await auth()
  if (session?.user) {
    let userId = session.user.id
    if (session.user.employeeCode) {
      const dbUser = await prisma.user.findUnique({
        where: { employeeCode: session.user.employeeCode },
        select: { id: true },
      })
      if (dbUser) userId = dbUser.id
      else return null
    }
    return { operatorId: userId, source: 'nextauth' }
  }

  const raw = getRawCookie()
  if (!raw) return null
  const sub = await verifyScanOperatorToken(raw)
  if (!sub) return null
  const u = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, isActive: true },
  })
  if (!u?.isActive) return null
  return { operatorId: u.id, source: 'scan' }
}

/** Server Components / Route Handlers ที่มี `cookies()` */
export async function getOperatorIdFromCookies(): Promise<string | null> {
  const store = await cookies()
  const ctx = await resolveOperatorContext(() => store.get(SCAN_COOKIE_NAME)?.value)
  return ctx?.operatorId ?? null
}

export async function getOperatorContextFromApiRequest(
  req: NextRequest
): Promise<OperatorContext | null> {
  return resolveOperatorContext(() => req.cookies.get(SCAN_COOKIE_NAME)?.value)
}

export async function getOperatorIdFromApiRequest(req: NextRequest): Promise<string | null> {
  const ctx = await getOperatorContextFromApiRequest(req)
  return ctx?.operatorId ?? null
}
