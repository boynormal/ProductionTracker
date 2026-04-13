'use client'

import { ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type LineTargetRow = {
  id: string
  piecesPerHour: number
  target8Hr: number
  target11Hr: number
  line: {
    lineCode: string
    lineName: string
  }
}

interface Props {
  lineTargets: LineTargetRow[] | undefined
}

function sortLineTargets(rows: LineTargetRow[]): LineTargetRow[] {
  return [...rows].sort((a, b) =>
    (a.line?.lineCode ?? '').localeCompare(b.line?.lineCode ?? '', 'th', { numeric: true }),
  )
}

export function PartsLineTargetsCell({ lineTargets }: Props) {
  const { locale } = useI18n()
  const th = locale === 'th'
  const list = lineTargets?.length ? sortLineTargets(lineTargets) : []

  if (list.length === 0) {
    return <span className="text-slate-400">—</span>
  }

  return (
    <details className="group max-w-[22rem]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-left text-slate-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        <span className="tabular-nums font-medium text-slate-800">{list.length}</span>
        <span className="text-xs text-slate-500">{th ? 'สาย' : 'Lines'}</span>
      </summary>
      <ul className="mt-2 space-y-2 border-l-2 border-emerald-100 pl-3 text-xs leading-relaxed text-slate-600">
        {list.map((t) => {
          const code = t.line?.lineCode ?? '—'
          const name = t.line?.lineName?.trim()
          return (
            <li key={t.id} className="block">
              <div className="font-medium text-slate-700">
                {code}
                {name ? <span className="font-normal text-slate-500"> — {name}</span> : null}
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
