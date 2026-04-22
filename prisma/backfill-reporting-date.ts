import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const THAI_OFFSET_MS = 7 * 60 * 60 * 1000
const CUTOFF_HOUR = 8
const CUTOFF_MINUTE = 0

function reportingDateFromInstant(instant: Date): Date {
  const thaiNow = new Date(instant.getTime() + THAI_OFFSET_MS)
  const minutesNow = thaiNow.getUTCHours() * 60 + thaiNow.getUTCMinutes()
  const cutoffMinutes = CUTOFF_HOUR * 60 + CUTOFF_MINUTE
  const dayOffset = minutesNow < cutoffMinutes ? -1 : 0
  return new Date(Date.UTC(
    thaiNow.getUTCFullYear(),
    thaiNow.getUTCMonth(),
    thaiNow.getUTCDate() + dayOffset,
  ))
}

async function main() {
  const apply = process.argv.includes('--apply')
  const pending = await prisma.productionSession.count({ where: { reportingDate: null } })

  console.log(`[reporting-date-backfill] pending rows: ${pending}`)
  if (pending === 0) {
    console.log('[reporting-date-backfill] nothing to do.')
    return
  }

  const samples = await prisma.productionSession.findMany({
    where: { reportingDate: null },
    select: { id: true, startTime: true, sessionDate: true, shiftType: true, lineId: true },
    orderBy: { startTime: 'asc' },
    take: 12,
  })

  console.log('[reporting-date-backfill] sample preview:')
  for (const s of samples) {
    const computed = reportingDateFromInstant(s.startTime).toISOString().slice(0, 10)
    console.log(
      `- id=${s.id} line=${s.lineId} shift=${s.shiftType} start=${s.startTime.toISOString()} sessionDate=${s.sessionDate.toISOString().slice(0, 10)} -> reportingDate=${computed}`,
    )
  }

  if (!apply) {
    console.log('[reporting-date-backfill] dry-run only. Re-run with --apply to execute updates.')
    return
  }

  const updated = await prisma.$executeRaw`
    UPDATE "production_sessions"
    SET "reportingDate" = CASE
      WHEN ((("startTime" AT TIME ZONE 'Asia/Bangkok')::time) < TIME '08:00:00')
        THEN ((("startTime" AT TIME ZONE 'Asia/Bangkok')::date) - 1)
      ELSE (("startTime" AT TIME ZONE 'Asia/Bangkok')::date)
    END
    WHERE "reportingDate" IS NULL
  `

  const remaining = await prisma.productionSession.count({ where: { reportingDate: null } })
  console.log(`[reporting-date-backfill] updated rows: ${updated}`)
  console.log(`[reporting-date-backfill] remaining null rows: ${remaining}`)
}

main()
  .catch((error) => {
    console.error('[reporting-date-backfill] failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
