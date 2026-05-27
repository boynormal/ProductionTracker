'use client'

import React, { useState, useMemo } from 'react'
import useSWRInfinite from 'swr/infinite'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import {
  Search, Loader2, ChevronDown, Package, Wrench, XCircle, CheckCircle2,
  CalendarDays, Factory, User, Tag, CalendarRange,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  DASHBOARD_TABLE_WRAP,
  DASHBOARD_TH_STICKY_SOLID,
  DASHBOARD_THEAD_STICKY,
} from '@/lib/dashboard-sticky-table-classes'

const PAGE_SIZE = 500

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(typeof j?.error === 'string' ? j.error : r.statusText)
  return j
}

type Mode = 'day' | 'month'

interface Division {
  id: string
  divisionCode: string
  divisionName: string
}

interface Line {
  id: string
  lineCode: string
  lineName?: string | null
  section?: { id: string; division?: { id: string } | null } | null
}

interface Part {
  id: string
  partSamco: number
  partNo: string
  partName: string
}

interface Props {
  userRole?: string
  divisions: Division[]
  lines: Line[]
  parts: Part[]
  initialDate: string
  initialMonth: string
}

interface LotResponse {
  data?: any[]
  total?: number
  hasMore?: boolean
}

function formatDateDisplay(dateStr: string | null | undefined, locale: string) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: locale === 'th' ? th : undefined })
  } catch {
    return dateStr
  }
}

function formatDateTimeDisplay(dateStr: string | null | undefined, locale: string) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'd MMM yyyy HH:mm', { locale: locale === 'th' ? th : undefined })
  } catch {
    return dateStr
  }
}

function buildSWRKey(
  mode: Mode,
  selectedDate: string,
  selectedMonth: string,
  divisionId: string,
  lineId: string,
  partId: string,
  lotSearch: string,
  skip: number,
  take: number,
): string {
  const params = new URLSearchParams({ mode })
  if (mode === 'day') params.set('date', selectedDate)
  else params.set('month', selectedMonth)
  if (divisionId) params.set('divisionId', divisionId)
  if (lineId) params.set('lineId', lineId)
  if (partId) params.set('partId', partId)
  if (lotSearch.trim()) params.set('lot', lotSearch.trim())
  params.set('skip', String(skip))
  params.set('take', String(take))
  return `/api/production/lot?${params.toString()}`
}

export function LotClient({ divisions, lines, parts, initialDate, initialMonth }: Props) {
  const { locale } = useI18n()

  const [mode, setMode] = useState<Mode>('day')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [divisionId, setDivisionId] = useState('')
  const [lineId, setLineId] = useState('')
  const [partId, setPartId] = useState('')
  const [lotSearch, setLotSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<LotResponse>(
    (pageIndex, previousPageData) => {
      if (previousPageData && !previousPageData.hasMore) return null
      return buildSWRKey(
        mode,
        selectedDate,
        selectedMonth,
        divisionId,
        lineId,
        partId,
        lotSearch,
        pageIndex * PAGE_SIZE,
        PAGE_SIZE,
      )
    },
    fetcher,
  )

  const pages = data ?? []
  const records: any[] = pages.flatMap((page) => (Array.isArray(page?.data) ? page.data : []))
  const firstPage = pages[0]
  const lastPage = pages[pages.length - 1]
  const total = typeof firstPage?.total === 'number' ? firstPage.total : records.length
  const hasMore = Boolean(lastPage?.hasMore)
  const isLoadingInitial = isLoading && records.length === 0
  const isLoadingMore = isLoadingInitial || (size > 0 && typeof pages[size - 1] === 'undefined')
  const isRefreshing = isValidating && !isLoadingMore

  const filteredLines = useMemo(() => {
    if (!divisionId) return lines
    return lines.filter((l) => l.section?.division?.id === divisionId)
  }, [lines, divisionId])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDivisionChange = (val: string) => {
    setDivisionId(val)
    setLineId('')
  }

  const handleModeChange = (m: Mode) => {
    setMode(m)
    setExpandedIds(new Set())
  }

  // ซ่อนคอลัมน์ Lot ถ้ากรอก lot search เพราะทุก row เป็น lot เดียวกัน
  const showLotCol = !lotSearch.trim()

  const periodLabel = (() => {
    if (mode === 'day') {
      try { return format(parseISO(selectedDate), 'd MMM yyyy', { locale: locale === 'th' ? th : undefined }) }
      catch { return selectedDate }
    }
    try {
      const [y, m] = selectedMonth.split('-')
      return format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy', { locale: locale === 'th' ? th : undefined })
    } catch { return selectedMonth }
  })()

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {locale === 'th' ? 'ตรวจสอบ Lot การผลิต' : 'Lot Traceability'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {locale === 'th'
            ? 'รายงานตามวัน/เดือน — กรองฝ่าย สายการผลิต และ Lot Number'
            : 'Daily / Monthly report — filter by division, line, and lot number'}
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-nowrap items-end gap-2 overflow-x-auto rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:gap-3">

        {/* Mode toggle */}
        <div className="shrink-0">
          <p className="mb-1 text-xs font-medium text-slate-500">{locale === 'th' ? 'รูปแบบ' : 'Mode'}</p>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange('day')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                mode === 'day'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <CalendarDays size={13} />
              {locale === 'th' ? 'วัน' : 'Day'}
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('month')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                mode === 'month'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <CalendarRange size={13} />
              {locale === 'th' ? 'เดือน' : 'Month'}
            </button>
          </div>
        </div>

        {/* Date / Month picker */}
        <div className="w-[9.5rem] shrink-0">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <CalendarDays size={12} className="text-slate-400" />
            {mode === 'day' ? (locale === 'th' ? 'วันที่' : 'Date') : (locale === 'th' ? 'เดือน' : 'Month')}
          </label>
          {mode === 'day' ? (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setExpandedIds(new Set()) }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setExpandedIds(new Set()) }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          )}
        </div>

        {/* Division */}
        <div className="w-[11rem] shrink-0">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Factory size={12} className="text-slate-400" />
            {locale === 'th' ? 'ฝ่าย' : 'Division'}
          </label>
          <select
            value={divisionId}
            onChange={(e) => handleDivisionChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{locale === 'th' ? 'ทุกฝ่าย' : 'All divisions'}</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.divisionCode} {d.divisionName}
              </option>
            ))}
          </select>
        </div>

        {/* Line */}
        <div className="w-[9rem] shrink-0">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Factory size={12} className="text-slate-400" />
            {locale === 'th' ? 'สายการผลิต' : 'Line'}
          </label>
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{locale === 'th' ? 'ทุกสาย' : 'All lines'}</option>
            {filteredLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lineCode}
              </option>
            ))}
          </select>
        </div>

        {/* Part */}
        <div className="w-[13rem] shrink-0">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Package size={12} className="text-slate-400" />
            {locale === 'th' ? 'Part' : 'Part'}
          </label>
          <select
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{locale === 'th' ? 'ทุก Part' : 'All parts'}</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.partSamco} — {p.partName}
              </option>
            ))}
          </select>
        </div>

        {/* Lot search */}
        <div className="min-w-[9rem] flex-1">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Tag size={12} className="text-slate-400" />
            {locale === 'th' ? 'Lot Number' : 'Lot Number'}
          </label>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={lotSearch}
              onChange={(e) => setLotSearch(e.target.value)}
              placeholder={locale === 'th' ? 'ค้นหา Lot...' : 'Search lot...'}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays size={13} className="text-slate-400" />
          <span>{periodLabel}</span>
        </div>
        {(isLoadingInitial || isRefreshing) && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Loader2 size={12} className="animate-spin" />
            {isLoadingInitial
              ? (locale === 'th' ? 'กำลังโหลด...' : 'Loading...')
              : (locale === 'th' ? 'กำลังอัปเดต...' : 'Refreshing...')}
          </span>
        )}
        {!isLoadingInitial && !error && firstPage && (
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
            {records.length.toLocaleString()} {locale === 'th' ? 'รายการ' : 'records'}
            {total > records.length && (
              <span className="ml-1 text-amber-600">
                / {total.toLocaleString()}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message ?? (locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error loading data')}
        </p>
      )}

      {/* ── Table ── */}
      {!error && records.length === 0 && !isLoadingInitial && firstPage ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
          <Package size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-400">
            {locale === 'th' ? 'ไม่มีข้อมูลในช่วงที่เลือก' : 'No records found for the selected period'}
          </p>
        </div>
      ) : records.length > 0 ? (
        <>
          <div className={cn(DASHBOARD_TABLE_WRAP, isRefreshing && 'opacity-60 pointer-events-none')}>
            <table className="w-full min-w-[60rem] border-separate border-spacing-0 bg-white text-sm">
              <thead className={DASHBOARD_THEAD_STICKY}>
                <tr>
                  <th className={DASHBOARD_TH_STICKY_SOLID} style={{ width: 32 }}></th>
                  <th className={DASHBOARD_TH_STICKY_SOLID}>
                    <span className="flex items-center gap-1"><CalendarDays size={11} />{locale === 'th' ? 'วันที่ / กะ' : 'Date / Shift'}</span>
                  </th>
                  <th className={DASHBOARD_TH_STICKY_SOLID}>
                    <span className="flex items-center gap-1"><Factory size={11} />{locale === 'th' ? 'สาย / Slot' : 'Line / Slot'}</span>
                  </th>
                  <th className={DASHBOARD_TH_STICKY_SOLID}>
                    <span className="flex items-center gap-1"><Package size={11} />Part</span>
                  </th>
                  {showLotCol && (
                    <th className={DASHBOARD_TH_STICKY_SOLID}>
                      <span className="flex items-center gap-1"><Tag size={11} />Lot</span>
                    </th>
                  )}
                  <th className={DASHBOARD_TH_STICKY_SOLID}>
                    <span className="flex items-center gap-1"><User size={11} />{locale === 'th' ? 'พนักงาน' : 'Operator'}</span>
                  </th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOLID, 'text-right')}>
                    <span className="flex items-center justify-end gap-1"><CheckCircle2 size={11} />OK</span>
                  </th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOLID, 'text-right')}>
                    <span className="flex items-center justify-end gap-1"><XCircle size={11} />NG</span>
                  </th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOLID, 'text-center')}>
                    <span className="flex items-center justify-center gap-1"><Wrench size={11} />BD</span>
                  </th>
                  <th className={DASHBOARD_TH_STICKY_SOLID}>{locale === 'th' ? 'หมายเหตุ' : 'Remark'}</th>
                </tr>
              </thead>
              <tbody>
              {records.map((rec: any) => {
                const ngTotal = (rec.ngLogs ?? []).reduce((s: number, ng: any) => s + (ng.ngQty || 0), 0)
                const bdTotal = (rec.breakdownLogs ?? []).reduce((s: number, bd: any) => s + (bd.breakTimeMin || 0), 0)
                const operatorName = [rec.operator?.firstName, rec.operator?.lastName].filter(Boolean).join(' ')
                const reportingDate = rec.session?.reportingDate ?? rec.session?.sessionDate
                const isNight = rec.session?.shiftType === 'NIGHT'
                const shiftLabel = isNight
                  ? (locale === 'th' ? 'กะดึก' : 'Night')
                  : (locale === 'th' ? 'กะเช้า' : 'Day')
                const isExpanded = expandedIds.has(rec.id)
                const hasDetail = (rec.breakdownLogs?.length > 0 || rec.ngLogs?.length > 0)
                const colSpan = showLotCol ? 10 : 9

                return (
                  <React.Fragment key={rec.id}>
                    <tr className={cn(
                      'border-b border-slate-100 transition-colors',
                      isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50/60',
                    )}>
                      {/* Expand */}
                      <td className="border-b border-slate-100 px-2 py-2.5">
                        {hasDetail ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(rec.id)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
                          >
                            <ChevronDown
                              size={14}
                              className={cn('transition-transform duration-200', isExpanded ? 'rotate-0' : '-rotate-90')}
                            />
                          </button>
                        ) : <span className="block w-5" />}
                      </td>

                      {/* Date / Shift */}
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-700">{formatDateDisplay(reportingDate, locale)}</p>
                        <span className={cn(
                          'mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          isNight ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700',
                        )}>
                          {shiftLabel}
                        </span>
                      </td>

                      {/* Line / Slot */}
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">
                          {rec.session?.line?.lineCode ?? '—'}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-500">
                          Slot {rec.hourSlot}
                        </span>
                        {rec.session?.machine?.mcNo && (
                          <p className="mt-0.5 text-[10px] text-slate-400">{rec.session.machine.mcNo}</p>
                        )}
                      </td>

                      {/* Part */}
                      <td className="border-b border-slate-100 px-3 py-2.5">
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {rec.part?.partSamco ?? '—'}
                        </p>
                        {rec.part?.partName && (
                          <p className="text-[10px] text-slate-500 truncate max-w-[10rem]">{rec.part.partName}</p>
                        )}
                        {rec.part?.customer?.customerCode && (
                          <p className="text-[10px] text-blue-500">{rec.part.customer.customerCode}</p>
                        )}
                      </td>

                      {/* Lot */}
                      {showLotCol && (
                        <td className="border-b border-slate-100 px-3 py-2.5">
                          {rec.lotNumber ? (
                            <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
                              {rec.lotNumber}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      )}

                      {/* Operator */}
                      <td className="border-b border-slate-100 px-3 py-2.5 text-xs text-slate-700">
                        {operatorName || <span className="text-slate-300">—</span>}
                        {rec.operator?.employeeCode && (
                          <p className="text-[10px] text-slate-400">{rec.operator.employeeCode}</p>
                        )}
                      </td>

                      {/* OK */}
                      <td className="border-b border-slate-100 px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                        {rec.okQty.toLocaleString()}
                      </td>

                      {/* NG */}
                      <td className="border-b border-slate-100 px-3 py-2.5 text-right">
                        {ngTotal > 0 ? (
                          <span className="font-mono font-semibold text-orange-600">{ngTotal.toLocaleString()}</span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>

                      {/* BD */}
                      <td className="border-b border-slate-100 px-3 py-2.5 text-center">
                        {bdTotal > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                            <Wrench size={10} />
                            {bdTotal} {locale === 'th' ? 'นาที' : 'min'}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>

                      {/* Remark */}
                      <td className="border-b border-slate-100 px-3 py-2.5 max-w-[10rem] truncate text-xs text-slate-500">
                        {rec.remark || <span className="text-slate-300">—</span>}
                      </td>
                    </tr>

                    {/* Expand detail row */}
                    {isExpanded && hasDetail && (
                      <tr className="border-b border-slate-100 bg-blue-50/20">
                        <td colSpan={colSpan} className="px-8 py-3">
                          <div className="grid gap-4 sm:grid-cols-2">
                            {/* Breakdown detail */}
                            {rec.breakdownLogs?.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                                  Breakdown ({rec.breakdownLogs.length} {locale === 'th' ? 'ครั้ง' : 'events'})
                                </p>
                                <div className="space-y-1.5">
                                  {rec.breakdownLogs.map((bd: any) => (
                                    <div key={bd.id} className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-700">
                                          {bd.problemCategory?.name ?? bd.problemCategory?.code ?? '—'}
                                        </span>
                                        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-mono font-bold text-red-700">
                                          {bd.breakTimeMin} {locale === 'th' ? 'นาที' : 'min'}
                                        </span>
                                      </div>
                                      {bd.problemDetail && (
                                        <p className="mt-0.5 text-slate-500">{bd.problemDetail}</p>
                                      )}
                                      {bd.actionTaken && (
                                        <p className="mt-0.5 text-slate-400">
                                          {locale === 'th' ? 'แก้ไข: ' : 'Action: '}{bd.actionTaken}
                                        </p>
                                      )}
                                      <p className="mt-0.5 text-[10px] text-slate-400">
                                        {formatDateTimeDisplay(bd.breakdownStart, locale)}
                                        {bd.breakdownEnd ? ` → ${formatDateTimeDisplay(bd.breakdownEnd, locale)}` : ''}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* NG detail */}
                            {rec.ngLogs?.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
                                  NG ({rec.ngLogs.length} {locale === 'th' ? 'รายการ' : 'items'})
                                </p>
                                <div className="space-y-1.5">
                                  {rec.ngLogs.map((ng: any) => (
                                    <div key={ng.id} className="rounded-lg border border-orange-100 bg-white px-3 py-2 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-700">
                                          {ng.problemCategory?.name ?? ng.problemCategory?.code ?? '—'}
                                        </span>
                                        <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 font-mono font-bold text-orange-700">
                                          {ng.ngQty.toLocaleString()} {locale === 'th' ? 'ชิ้น' : 'pcs'}
                                        </span>
                                      </div>
                                      {ng.problemDetail && (
                                        <p className="mt-0.5 text-slate-500">{ng.problemDetail}</p>
                                      )}
                                      {ng.actionTaken && (
                                        <p className="mt-0.5 text-slate-400">
                                          {locale === 'th' ? 'แก้ไข: ' : 'Action: '}{ng.actionTaken}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setSize(size + 1)}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMore && <Loader2 size={15} className="animate-spin" />}
                {locale === 'th' ? 'โหลดข้อมูลเพิ่มเติม' : 'Load more records'}
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
