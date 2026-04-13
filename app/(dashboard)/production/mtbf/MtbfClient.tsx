'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { Activity, Loader2, Wrench, AlertTriangle, Clock } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { cn } from '@/lib/utils/cn'
import { DASHBOARD_TABLE_BASE, DASHBOARD_TH_STICKY_SOFT_COMFORTABLE } from '@/lib/dashboard-sticky-table-classes'

interface MtbfRow {
  machineId: string
  mcNo: string
  lineName: string
  mtbf: number
  mttr: number
  failureCount: number
  totalRunHours: number
  totalDowntimeHours: number
}

interface Props {
  lines: { id: string; lineCode: string }[]
  machines: { id: string; mcNo: string; mcName: string; lineId: string }[]
}

function mtbfColor(val: number) {
  if (val >= 100) return 'text-emerald-600 bg-emerald-50'
  if (val >= 50) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

function mttrColor(val: number) {
  if (val <= 0.5) return 'text-emerald-600 bg-emerald-50'
  if (val <= 2) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

export function MtbfClient({ lines, machines }: Props) {
  const { locale } = useI18n()
  const [lineFilter, setLineFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState<MtbfRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const handleCalculate = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo })
      if (lineFilter !== 'all') params.set('lineId', lineFilter)
      const res = await fetch(`/api/production/mtbf?${params}`)
      const json = await res.json()
      setData(json.data ?? [])
      setFetched(true)
    } finally {
      setLoading(false)
    }
  }

  const avgMtbf = data.length ? +(data.reduce((s, r) => s + r.mtbf, 0) / data.length).toFixed(2) : 0
  const avgMttr = data.length ? +(data.reduce((s, r) => s + r.mttr, 0) / data.length).toFixed(2) : 0
  const totalFailures = data.reduce((s, r) => s + r.failureCount, 0)

  const showLoader   = loading
  const showHint     = !loading && !fetched
  const showEmpty    = !loading && fetched && data.length === 0
  const showTable    = !loading && fetched && data.length > 0

  return (
    <div className="space-y-5" translate="no">
      {/* Header — ใช้ span แทนการผสมหลาย node ใน h1 ให้โครงสร้างชัด */}
      <h1 className="text-xl font-bold text-slate-800">
        <span className="inline-flex items-center gap-2">
          <Activity size={22} className="shrink-0 text-blue-600" aria-hidden />
          <span>MTBF / MTTR Report</span>
        </span>
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
        <div>
          <label className="text-xs text-slate-500 block mb-1">{locale === 'th' ? 'สาย' : 'Line'}</label>
          <select value={lineFilter} onChange={e => setLineFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
            <option value="all">{locale === 'th' ? 'ทุกสาย' : 'All Lines'}</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.lineCode}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">{locale === 'th' ? 'จากวันที่' : 'From'}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">{locale === 'th' ? 'ถึงวันที่' : 'To'}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        </div>
        <button
          type="button"
          onClick={handleCalculate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center" aria-hidden>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          </span>
          <span>{locale === 'th' ? 'คำนวณ' : 'Calculate'}</span>
        </button>
      </div>

      {/* Summary Cards */}
      {fetched && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5"><Clock size={20} className="text-blue-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{locale === 'th' ? 'MTBF เฉลี่ย' : 'Avg MTBF'}</p>
              <p className="text-lg font-bold text-slate-800">{avgMtbf} <span className="text-xs font-normal text-slate-400">hrs</span></p>
            </div>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5"><Wrench size={20} className="text-amber-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{locale === 'th' ? 'MTTR เฉลี่ย' : 'Avg MTTR'}</p>
              <p className="text-lg font-bold text-slate-800">{avgMttr} <span className="text-xs font-normal text-slate-400">hrs</span></p>
            </div>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg bg-red-50 p-2.5"><AlertTriangle size={20} className="text-red-600" /></div>
            <div>
              <p className="text-xs text-slate-500">{locale === 'th' ? 'Failures ทั้งหมด' : 'Total Failures'}</p>
              <p className="text-lg font-bold text-slate-800">{totalFailures}</p>
            </div>
          </div>
        </div>
      )}

      {/* สถานะหลัก — ห้ามรวม `hidden` กับ `flex` ใน class เดียว: Tailwind จะให้ display ตัวหนึ่งชนะจนโหลดยังโผล่ */}
      <div className="relative min-h-[120px]">
        <div className={showLoader ? 'flex items-center justify-center py-20' : 'hidden'}>
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
        <div className={showHint ? 'rounded-xl bg-white border py-16 text-center text-sm text-slate-400' : 'hidden'}>
          {locale === 'th' ? 'เลือกช่วงเวลาแล้วกด "คำนวณ"' : 'Select a date range and click "Calculate"'}
        </div>
        <div className={showEmpty ? 'rounded-xl bg-white border py-16 text-center text-sm text-slate-400' : 'hidden'}>
          {locale === 'th' ? 'ไม่มีข้อมูลในช่วงเวลาที่เลือก' : 'No data for selected period'}
        </div>
        <div className={showTable ? 'w-full min-w-0 rounded-xl bg-white border border-slate-100 shadow-sm' : 'hidden'}>
          <table className={DASHBOARD_TABLE_BASE}>
            <thead>
              <tr>
                <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'สาย' : 'Line'}</th>
                <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'เครื่อง' : 'Machine'}</th>
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>MTBF (hrs)</th>
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>MTTR (hrs)</th>
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>Failures</th>
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>{locale === 'th' ? 'Run Hours' : 'Run Hours'}</th>
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>
                  {locale === 'th' ? 'Downtime (hrs)' : 'Downtime (hrs)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.machineId} className="hover:bg-slate-50">
                  <td className="border border-slate-100 px-4 py-3 text-slate-500">{row.lineName}</td>
                  <td className="border border-slate-100 px-4 py-3 font-medium">{row.mcNo}</td>
                  <td className="border border-slate-100 px-4 py-3 text-right">
                    <span className={cn('font-mono font-semibold rounded px-2 py-0.5', mtbfColor(row.mtbf))}>{row.mtbf}</span>
                  </td>
                  <td className="border border-slate-100 px-4 py-3 text-right">
                    <span className={cn('font-mono font-semibold rounded px-2 py-0.5', mttrColor(row.mttr))}>{row.mttr}</span>
                  </td>
                  <td className="border border-slate-100 px-4 py-3 text-right font-mono">{row.failureCount}</td>
                  <td className="border border-slate-100 px-4 py-3 text-right font-mono">{row.totalRunHours}</td>
                  <td className="border border-slate-100 px-4 py-3 text-right font-mono text-red-500">{row.totalDowntimeHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
