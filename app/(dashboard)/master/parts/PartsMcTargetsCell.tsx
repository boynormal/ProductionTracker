'use client'

import { ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type TargetRow = {
  id: string
  piecesPerHour: number
  target8Hr: number
  target11Hr: number
  machine: {
    mcNo: string
    mcName: string
    line: { lineCode: string } | null
  }
}

interface Props {
  targets: TargetRow[] | undefined
}

function sortTargets(targets: TargetRow[]): TargetRow[] {
  return [...targets].sort((a, b) => {
    const la = a.machine?.line?.lineCode ?? ''
    const lb = b.machine?.line?.lineCode ?? ''
    if (la !== lb) return la.localeCompare(lb, 'th', { numeric: true })
    return (a.machine?.mcNo ?? '').localeCompare(b.machine?.mcNo ?? '', 'th', { numeric: true })
  })
}

export function PartsMcTargetsCell({ targets }: Props) {
  const { locale } = useI18n()
  const th = locale === 'th'
  const list = targets?.length ? sortTargets(targets) : []

  if (list.length === 0) {
    return <span className="text-slate-400">—</span>
  }

  return (
    <details className="group max-w-[22rem]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-left text-slate-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        <span className="tabular-nums font-medium text-slate-800">{list.length}</span>
        <span className="text-xs text-slate-500">{th ? 'เป้า M/C' : 'M/C targets'}</span>
      </summary>
      <ul className="mt-2 space-y-2 border-l-2 border-indigo-100 pl-3 text-xs leading-relaxed text-slate-600">
        {list.map((t) => {
          const line = t.machine?.line?.lineCode ?? '—'
          const mc = t.machine?.mcNo ?? '—'
          const name = t.machine?.mcName?.trim()
          return (
            <li key={t.id} className="block">
              <div className="font-medium text-slate-700">
                {line}
                <span className="text-slate-400"> · </span>
                {mc}
                {name ? <span className="font-normal text-slate-500"> ({name})</span> : null}
              </div>
              <div className="mt-0.5 pl-0 text-[11px] text-slate-500">
                {th ? 'ชิ้น/ชม.' : 'PPH'} {t.piecesPerHour}
                <span className="mx-1.5 text-slate-300">|</span>
                8H {t.target8Hr}
                <span className="mx-1.5 text-slate-300">|</span>
                11H {t.target11Hr}
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
