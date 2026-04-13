import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

/**
 * JWT อาจเก็บ user id เก่าหลัง restore / seed / clear DB — audit_logs.userId เป็น FK
 * คืน id จากตาราง users หรือ null (บันทึก audit โดยไม่ผูก user)
 */
export async function auditUserIdFromSession(session: Session | null): Promise<string | null> {
  if (!session?.user) return null
  const id = session.user.id
  const code = session.user.employeeCode
  if (id) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (u) return u.id
  }
  if (code) {
    const u = await prisma.user.findUnique({ where: { employeeCode: code }, select: { id: true } })
    if (u) return u.id
  }
  return null
}

export async function auditUserIdFromDbUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  return u?.id ?? null
}
