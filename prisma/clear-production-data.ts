/**
 * ลบเฉพาะข้อมูลการผลิต (transaction) — ไม่ลบ master: users, machines, parts, lines, …
 *
 * รัน: npm run db:clear-production
 *
 * ลำดับลบอิง FK แบบ ON DELETE RESTRICT ใน migration
 */
import { PrismaClient, NotificationType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.modelChange.deleteMany()
    await tx.breakdownLog.deleteMany()
    await tx.ngLog.deleteMany()
    await tx.hourlyRecord.deleteMany()
    await tx.productionSession.deleteMany()
    await tx.notification.deleteMany({
      where: {
        OR: [
          { sessionId: { not: null } },
          {
            type: {
              in: [
                NotificationType.MISSING_RECORD,
                NotificationType.LOW_PRODUCTION,
                NotificationType.HIGH_NG,
                NotificationType.LONG_BREAKDOWN,
              ],
            },
          },
        ],
      },
    })
  })

  console.log(
    'Done: production_sessions, hourly_records, breakdown_logs, ng_logs, model_changes, and production-related notifications removed.',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
