'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

const MANUAL_TH = 'https://www.youtube.com/watch?v=hvA8VVE6pSY'
const MANUAL_MY = 'https://www.youtube.com/watch?v=Ce4KEnokeDI'

type Props = {
  variant?: 'header' | 'scan'
  className?: string
}

export function ManualGuideMenu({ variant = 'header', className }: Props) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const th = locale === 'th'

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const compact = variant === 'header'

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600',
          compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        )}
      >
        <BookOpen size={compact ? 13 : 16} />
        {th ? 'คู่มือ' : 'Manual'}
        <ChevronDown size={compact ? 12 : 14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <a
            role="menuitem"
            href={MANUAL_TH}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            คู่มือไทย
          </a>
          <a
            role="menuitem"
            href={MANUAL_MY}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            คู่มือพม่า
          </a>
        </div>
      )}
    </div>
  )
}
