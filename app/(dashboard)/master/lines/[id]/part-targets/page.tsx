import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Factory } from 'lucide-react'
import { LinePartTargetsPageClient } from './LinePartTargetsPageClient'

export default async function LinePartTargetsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: lineId } = await params
  const session = await auth()
  const canEditMaster = ['ADMIN', 'ENGINEER'].includes(session?.user?.role ?? '')

  const [line, targets, parts] = await Promise.all([
    prisma.line.findUnique({
      where: { id: lineId },
      select: {
        id: true,
        lineCode: true,
        lineName: true,
        section: { select: { sectionCode: true, sectionName: true } },
      },
    }),
    prisma.linePartTarget.findMany({
      where: { lineId },
      include: { part: { include: { customer: true } } },
      orderBy: { part: { partSamco: 'asc' } },
    }),
    prisma.part.findMany({
      where: { isActive: true },
      select: {
        id: true,
        partSamco: true,
        partName: true,
        customer: { select: { customerCode: true } },
      },
      orderBy: { partSamco: 'asc' },
    }),
  ])

  if (!line) notFound()

  const lineLabel = `${line.lineCode} — ${line.lineName}`
  const targetsJson = JSON.parse(JSON.stringify(targets))
  const partsJson = JSON.parse(JSON.stringify(parts))

  return (
    <div className="space-y-6">
      <Link
        href="/master/lines"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} />
        กลับไปสายการผลิต
      </Link>

      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <Factory size={22} className="text-blue-600" />
          เป้าระดับสาย (LinePartTarget)
        </h1>
        <p className="text-sm text-slate-500">
          {lineLabel}
          {line.section ? (
            <span className="text-slate-400">
              {' '}
              · {line.section.sectionCode} {line.section.sectionName}
            </span>
          ) : null}
        </p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <LinePartTargetsPageClient
          lineId={line.id}
          lineLabel={lineLabel}
          initialTargets={targetsJson}
          parts={partsJson}
          canEdit={canEditMaster}
        />
      </div>
    </div>
  )
}
