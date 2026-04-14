import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR'

type WriteSystemLogArgs = {
  severity: LogSeverity
  source: string
  message: string
  category?: string
  details?: Prisma.JsonValue
  traceId?: string
  path?: string
  method?: string
  userId?: string | null
}

export async function writeSystemLog(args: WriteSystemLogArgs) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await prisma.$executeRaw`
    INSERT INTO "system_logs"
      ("id", "userId", "source", "category", "severity", "message", "details", "traceId", "path", "method", "createdAt")
    VALUES
      (${id}, ${args.userId ?? null}, ${args.source}, ${args.category ?? null}, ${args.severity}::"LogSeverity", ${args.message}, ${args.details ? JSON.stringify(args.details) : null}::jsonb, ${args.traceId ?? null}, ${args.path ?? null}, ${args.method ?? null}, now())
  `
}

export async function logInfo(args: Omit<WriteSystemLogArgs, 'severity'>) {
  await writeSystemLog({ ...args, severity: 'INFO' })
}

export async function logWarn(args: Omit<WriteSystemLogArgs, 'severity'>) {
  await writeSystemLog({ ...args, severity: 'WARN' })
}

export async function logError(args: Omit<WriteSystemLogArgs, 'severity'>) {
  await writeSystemLog({ ...args, severity: 'ERROR' })
}

