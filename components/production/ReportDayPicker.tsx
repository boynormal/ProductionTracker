'use client'

import { useMemo, useState } from 'react'
import { format, parseISO, startOfDay } from 'date-fns'
import { th as thLocale, enUS } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/cn'

type Props = {
  value: string
  onChange: (ymd: string) => void
  th?: boolean
  className?: string
}

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function parseYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = parseISO(s)
  return Number.isNaN(d.getTime()) ? undefined : startOfDay(d)
}

export function ReportDayPicker({ value, onChange, th = true, className }: Props) {
  const [open, setOpen] = useState(false)
  const locale = th ? thLocale : enUS
  const selected = useMemo(() => parseYmd(value), [value])

  const label = useMemo(() => {
    if (!selected) return th ? 'เลือกวันที่' : 'Select date'
    return format(selected, 'd MMM yyyy', { locale })
  }, [selected, th, locale])

  const apply = (d: Date) => {
    onChange(ymd(startOfDay(d)))
    setOpen(false)
  }

  return (
    <div className={cn('min-w-0', className)}>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {th ? 'วันที่' : 'Date'}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex h-10 w-full min-w-[12rem] max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm',
              'outline-none transition-colors hover:border-slate-300 hover:bg-slate-50',
              'focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100',
            )}
          >
            <CalendarIcon size={16} className="shrink-0 text-blue-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">{th ? 'เลือกวันเดียว' : 'Pick one day'}</p>
            <button
              type="button"
              onClick={() => apply(new Date())}
              className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-blue-50"
            >
              {th ? 'วันนี้' : 'Today'}
            </button>
          </div>
          <div className="p-2">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) apply(d)
              }}
              defaultMonth={selected ?? new Date()}
              locale={locale}
              numberOfMonths={1}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
