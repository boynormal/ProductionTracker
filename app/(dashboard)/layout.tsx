import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureTelegramAlertLogStorage } from '@/lib/notifications/telegram-hourly-alert'
import { getOperatorIdFromCookies } from '@/lib/operator-auth'
import { ScanOperatorBar } from '@/components/layout/ScanOperatorBar'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getAllowedMenuKeysForUser } from '@/lib/permissions/guard'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const allowLineQr = (await headers()).get('x-allow-record-line-qr') === '1'

  if (session) {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        division: true,
        section: { include: { division: true } },
      },
    })
    const scopedDivisionId =
      session.user.role === 'ADMIN'
        ? null
        : (currentUser?.divisionId ?? currentUser?.section?.divisionId ?? null)
    const unreadNotifications = await prisma.notification.findMany({
      where: { isRead: false, sessionId: { not: null } },
      select: { id: true, sessionId: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    })
    const unreadSessionIds = Array.from(
      new Set(unreadNotifications.map((item) => item.sessionId).filter((id): id is string => Boolean(id))),
    )
    const scopedUnreadSessions = unreadSessionIds.length > 0
      ? await prisma.productionSession.findMany({
          where: {
            id: { in: unreadSessionIds },
            ...(scopedDivisionId
              ? {
                  line: {
                    section: {
                      divisionId: scopedDivisionId,
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        })
      : []
    const scopedUnreadSessionIdSet = new Set(scopedUnreadSessions.map((item) => item.id))
    const unreadInAppCount = unreadNotifications.filter((item) => item.sessionId && scopedUnreadSessionIdSet.has(item.sessionId)).length

    await ensureTelegramAlertLogStorage()
    let telegramAttentionCount = 0
    try {
      const rows = scopedDivisionId
        ? await prisma.$queryRaw<Array<{ count: bigint | number }>>`
            SELECT COUNT(*)::bigint AS count
            FROM "telegram_alert_logs"
            WHERE "divisionId" = ${scopedDivisionId}
              AND LOWER("status") IN ('failed', 'skipped')
          `
        : await prisma.$queryRaw<Array<{ count: bigint | number }>>`
            SELECT COUNT(*)::bigint AS count
            FROM "telegram_alert_logs"
            WHERE LOWER("status") IN ('failed', 'skipped')
          `
      const rawCount = rows[0]?.count ?? 0
      telegramAttentionCount = typeof rawCount === 'bigint' ? Number(rawCount) : rawCount
    } catch (error) {
      console.error('[DashboardLayout] Failed to load Telegram attention count:', error)
    }

    const alertBadgeCount = unreadInAppCount + telegramAttentionCount
    const allowedMenuKeys = await getAllowedMenuKeysForUser(session.user.id, session.user.role)
    return (
      <DashboardShell
        userName={session.user.name ?? undefined}
        userRole={session.user.role ?? undefined}
        alertBadgeCount={alertBadgeCount}
        allowedMenuKeys={allowedMenuKeys}
      >
        {children}
      </DashboardShell>
    )
  }

  const scanOperatorId = await getOperatorIdFromCookies()

  if (scanOperatorId) {
    const scanUser = await prisma.user.findUnique({
      where: { id: scanOperatorId },
      select: { firstName: true, lastName: true, employeeCode: true, isActive: true },
    })
    if (!scanUser?.isActive) redirect('/login')

    const displayName = `${scanUser.firstName} ${scanUser.lastName}`

    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <ScanOperatorBar displayName={displayName} employeeCode={scanUser.employeeCode} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    )
  }

  /** QR สาย: ยังไม่มี cookie — เปิดหน้ากรอกรหัสพนักงาน (ไม่ redirect /login) */
  if (allowLineQr) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    )
  }

  redirect('/login')
}
