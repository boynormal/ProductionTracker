'use client'

import React, { useState, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import {
  Search, Loader2, ChevronDown, Package, Wrench, XCircle, CheckCircle2,
  CalendarDays, Factory, User, Tag,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'

interface LotClientProps {
  userRole?: string
}

export function LotClient({ userRole: _userRole }: LotClientProps) {
  const { locale } = useI18n()
  const [query, setQuery] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const handleSearch = useCallback(async (lotQuery: string) => {
    const q = lotQuery.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setSearched(true)
    setExpandedIds(new Set())
    try {
      const res = await fetch(`/api/production/lot?lot=${encodeURIComponent(q)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Load failed')
      setResults(Array.isArray(json.data) ? json.data : [])
      setQuery(q)
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    try {
      return format(parseISO(dateStr), 'd MMM yyyy', { locale: locale === 'th' ? th : undefined })
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—'
    try {
      return format(parseISO(dateStr), 'd MMM yyyy HH:mm', { locale: locale === 'th' ? th : undefined })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {locale === 'th' ? 'ตรวจสอบ Lot การผลิต' : 'Lot Traceability'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {locale === 'th'
            ? 'ค้นหาด้วย Lot Number เพื่อดูข้อมูลการผลิตย้อนหลัง'
            : 'Search by Lot Number to trace production history'}
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(inputValue) }}
            placeholder={locale === 'th' ? 'Lot Number เช่น LOT-2026-001' : 'Lot Number e.g. LOT-2026-001'}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          type="button"
          disabled={loading || !inputValue.trim()}
          onClick={() => handleSearch(inputValue)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {locale === 'th' ? 'ค้นหา' : 'Search'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Results */}
      {searched && !loading && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">
              {locale === 'th'
                ? `ผลลัพธ์สำหรับ Lot "${query}"`
                : `Results for Lot "${query}"`}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              {results.length} {locale === 'th' ? 'รายการ' : 'records'}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center shadow-sm">
              <Package size={40} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">
                {locale === 'th' ? `ไม่พบข้อมูล Lot "${query}"` : `No records found for Lot "${query}"`}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full min-w-[64rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left"></th>
                    <th className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5"><Tag size={12} />Lot</span>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5"><CalendarDays size={12} />{locale === 'th' ? 'วันที่ / กะ' : 'Date / Shift'}</span>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5"><Factory size={12} />{locale === 'th' ? 'สาย / Slot' : 'Line / Slot'}</span>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5"><Package size={12} />Part</span>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <span className="flex items-center gap-1.5"><User size={12} />{locale === 'th' ? 'พนักงาน' : 'Operator'}</span>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <span className="flex items-center justify-end gap-1.5"><CheckCircle2 size={12} />OK</span>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <span className="flex items-center justify-end gap-1.5"><XCircle size={12} />NG</span>
                    </th>
                    <th className="px-4 py-3 text-center">
                      <span className="flex items-center justify-center gap-1.5"><Wrench size={12} />BD</span>
                    </th>
                    <th className="px-4 py-3 text-left">{locale === 'th' ? 'หมายเหตุ' : 'Remark'}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((rec: any) => {
                    const ngTotal = (rec.ngLogs ?? []).reduce((s: number, ng: any) => s + (ng.ngQty || 0), 0)
                    const bdTotal = (rec.breakdownLogs ?? []).reduce((s: number, bd: any) => s + (bd.breakTimeMin || 0), 0)
                    const operatorName = [rec.operator?.firstName, rec.operator?.lastName].filter(Boolean).join(' ')
                    const reportingDate = rec.session?.reportingDate ?? rec.session?.sessionDate
                    const shift = rec.session?.shiftType === 'NIGHT'
                      ? (locale === 'th' ? 'กะดึก' : 'Night')
                      : (locale === 'th' ? 'กะเช้า' : 'Day')
                    const isExpanded = expandedIds.has(rec.id)
                    const hasDetail = (rec.breakdownLogs?.length > 0 || rec.ngLogs?.length > 0)

                    return (
                      <React.Fragment key={rec.id}>
                        <tr
                          className={cn(
                            'border-b border-slate-100 transition-colors',
                            isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50/60',
                          )}
                        >
                          {/* Expand button */}
                          <td className="px-3 py-3">
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

                          {/* Lot Number */}
                          <td className="px-4 py-3">
                            <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
                              {rec.lotNumber}
                            </span>
                          </td>

                          {/* Date / Shift */}
                          <td className="px-4 py-3">
                            <p className="text-xs font-semibold text-slate-700">{formatDate(reportingDate)}</p>
                            <p className="text-[10px] text-slate-400">{shift}</p>
                          </td>

                          {/* Line / Slot */}
                          <td className="px-4 py-3">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">
                              {rec.session?.line?.lineCode ?? '—'}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {locale === 'th' ? `Slot ${rec.hourSlot}` : `Slot ${rec.hourSlot}`}
                            </span>
                            {rec.session?.machine?.mcNo && (
                              <p className="mt-0.5 text-[10px] text-slate-400">{rec.session.machine.mcNo}</p>
                            )}
                          </td>

                          {/* Part */}
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold text-slate-800">
                              {rec.part?.partSamco ?? '—'}
                            </p>
                            {rec.part?.partName && (
                              <p className="text-[10px] text-slate-500">{rec.part.partName}</p>
                            )}
                            {rec.part?.customer?.customerCode && (
                              <p className="text-[10px] text-blue-500">{rec.part.customer.customerCode}</p>
                            )}
                          </td>

                          {/* Operator */}
                          <td className="px-4 py-3 text-xs text-slate-700">
                            {operatorName || '—'}
                          </td>

                          {/* OK */}
                          <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                            {rec.okQty.toLocaleString()}
                          </td>

                          {/* NG */}
                          <td className="px-4 py-3 text-right">
                            {ngTotal > 0 ? (
                              <span className="font-mono font-semibold text-orange-600">
                                {ngTotal.toLocaleString()}
                              </span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>

                          {/* Breakdown */}
                          <td className="px-4 py-3 text-center">
                            {bdTotal > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                                <Wrench size={10} />
                                {bdTotal}{locale === 'th' ? ' นาที' : ' min'}
                              </span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>

                          {/* Remark */}
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[12rem] truncate">
                            {rec.remark || <span className="text-slate-300">—</span>}
                          </td>
                        </tr>

                        {/* Detail row */}
                        {isExpanded && hasDetail && (
                          <tr className="border-b border-slate-100 bg-blue-50/30">
                            <td colSpan={10} className="px-8 py-3">
                              <div className="grid gap-4 sm:grid-cols-2">
                                {/* Breakdown detail */}
                                {rec.breakdownLogs?.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-xs font-semibold text-red-700 uppercase tracking-wide">
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
                                            <p className="mt-0.5 text-slate-400">{locale === 'th' ? 'แก้ไข: ' : 'Action: '}{bd.actionTaken}</p>
                                          )}
                                          <p className="mt-0.5 text-[10px] text-slate-400">
                                            {formatDateTime(bd.breakdownStart)}
                                            {bd.breakdownEnd ? ` → ${formatDateTime(bd.breakdownEnd)}` : ''}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* NG detail */}
                                {rec.ngLogs?.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-xs font-semibold text-orange-700 uppercase tracking-wide">
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
                                            <p className="mt-0.5 text-slate-400">{locale === 'th' ? 'แก้ไข: ' : 'Action: '}{ng.actionTaken}</p>
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
          )}
        </>
      )}
    </div>
  )
}
