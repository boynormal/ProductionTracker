import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureTelegramAlertLogStorage } from '@/lib/notifications/telegram-hourly-alert'
import { AlertsClient } from './AlertsClient'

type AlertChannel = 'in_app' | 'telegram'
export type AlertItem = {
  id: string
  sourceId: string
  channel: AlertChannel
  divisionId: string | null
  divisionName: string
  lineCode: string | null
  machineLabel: string | null
  alertType: string
  title: string
  message: string
  status: string
  isRead: boolean
  route: string | null
  sentAt: string | null
  windowLabel: string | null
  createdAt: string
}

function formatWindowLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${fmt.format(start)}-${fmt.format(end)}`
}

function inferTelegramRoute(message: string, errorMessage: string | null, chatId: string | null): string | null {
  if (errorMessage === 'Division Telegram disabled') return 'disabled'
  if (errorMessage === 'Missing division Telegram chat id') return chatId ? 'global_fallback' : 'no_destination'
  if (chatId) return 'division_or_global'
  if (message.includes('ยังไม่บันทึก')) return 'division_or_global'
  return null
}

export default async function AlertsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  if (session.user.role === 'OPERATOR') {
    redirect('/')
  }

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

  const notifications = await prisma.notification.findMany({
    where: scopedDivisionId
      ? {
          sessionId: { not: null },
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 150,
  })

  const sessionIds = Array.from(new Set(notifications.map((n) => n.sessionId).filter((id): id is string => Boolean(id))))

  const sessions = sessionIds.length > 0
    ? await prisma.productionSession.findMany({
        where: {
          id: { in: sessionIds },
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
        include: {
          line: {
            include: {
              section: {
                include: {
                  division: true,
                },
              },
            },
          },
          machine: true,
        },
      })
    : []

  const sessionMap = new Map(sessions.map((s) => [s.id, s]))

  await ensureTelegramAlertLogStorage()

  let alertLogs: Array<{
    id: string
    alertType: string
    divisionId: string | null
    divisionName: string | null
    chatId: string | null
    windowStart: Date
    windowEnd: Date
    status: string
    message: string
    errorMessage: string | null
    sentAt: Date | null
    createdAt: Date
  }> = []

  try {
    alertLogs = scopedDivisionId
      ? await prisma.$queryRaw`
          SELECT
            l."id",
            l."alertType",
            l."divisionId",
            d."divisionName",
            l."chatId",
            l."windowStart",
            l."windowEnd",
            l."status",
            l."message",
            l."errorMessage",
            l."sentAt",
            l."createdAt"
          FROM "telegram_alert_logs" l
          LEFT JOIN "divisions" d ON d."id" = l."divisionId"
          WHERE l."divisionId" = ${scopedDivisionId}
          ORDER BY l."createdAt" DESC
          LIMIT 150
        `
      : await prisma.$queryRaw`
          SELECT
            l."id",
            l."alertType",
            l."divisionId",
            d."divisionName",
            l."chatId",
            l."windowStart",
            l."windowEnd",
            l."status",
            l."message",
            l."errorMessage",
            l."sentAt",
            l."createdAt"
          FROM "telegram_alert_logs" l
          LEFT JOIN "divisions" d ON d."id" = l."divisionId"
          ORDER BY l."createdAt" DESC
          LIMIT 150
        `
  } catch (err) {
    console.error('[AlertsPage] Telegram log load failed:', err)
    alertLogs = []
  }

  const inAppItems = notifications
    .map<AlertItem | null>((notification) => {
      const linkedSession = notification.sessionId ? sessionMap.get(notification.sessionId) : null
      if (notification.sessionId && !linkedSession) return null
      const division = linkedSession?.line?.section?.division
      return {
        id: `in_app:${notification.id}`,
        sourceId: notification.id,
        channel: 'in_app',
        divisionId: division?.id ?? null,
        divisionName: division?.divisionName ?? 'Unassigned',
        lineCode: linkedSession?.line?.lineCode ?? null,
        machineLabel: linkedSession?.machine?.mcNo ?? null,
        alertType: String(notification.type),
        title: notification.title,
        message: notification.message,
        status: notification.isRead ? 'read' : 'unread',
        isRead: notification.isRead,
        route: notification.sentVia ? notification.sentVia.toLowerCase() : null,
        sentAt: null,
        windowLabel: notification.hourSlot ? `Hour ${notification.hourSlot}` : null,
        createdAt: notification.createdAt.toISOString(),
      }
    })
    .filter((item): item is AlertItem => item !== null)

  const telegramItems: AlertItem[] = alertLogs.map((log) => ({
    id: `telegram:${log.id}`,
    sourceId: log.id,
    channel: 'telegram',
    divisionId: log.divisionId,
    divisionName: log.divisionName ?? 'Unassigned',
    lineCode: null,
    machineLabel: null,
    alertType: log.alertType,
    title: 'Telegram Delivery',
    message: log.message,
    status: log.status.toLowerCase(),
    isRead: true,
    route: inferTelegramRoute(log.message, log.errorMessage, log.chatId),
    sentAt: log.sentAt ? log.sentAt.toISOString() : null,
    windowLabel: formatWindowLabel(log.windowStart, log.windowEnd),
    createdAt: log.createdAt.toISOString(),
  }))

  const items = [...inAppItems, ...telegramItems].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <AlertsClient
      items={JSON.parse(JSON.stringify(items))}
      role={session.user.role}
      scopedDivisionId={scopedDivisionId}
    />
  )
}
