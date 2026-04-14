import { prisma } from '@/lib/prisma'

/**
 * Returns true if another user already has this exact PIN (trimmed, non-empty).
 * @param excludeUserId — on user update, pass the user being edited so their current PIN does not count as a conflict.
 */
export async function isPinUsedByAnotherUser(
  pin: string | null | undefined,
  excludeUserId?: string,
): Promise<boolean> {
  if (pin == null) return false
  const p = pin.trim()
  if (!p) return false

  const found = await prisma.user.findFirst({
    where: {
      pin: p,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(found)
}
