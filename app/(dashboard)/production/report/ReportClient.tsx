'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n'
import { BarChart3, Download, Loader2 } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { getOeeBg } from '@/lib/utils/oee'

function downloadCSV(rows: any[], filename: string) {
  const headers = ['Date From', 'Date To', 'Line', 'Machine', 'Sessions', 'OK Qty', 'NG', 'BD (min)', 'Availability%', 'Performance%', 'Quality%', 'OEE%']
  const csvRows = [
    headers.join(','),
    ...rows.map((r: any) =>
      [r.dateFrom ?? '', r.dateTo ?? '', r.lineCode, r.mcNo, r.sessions, r.okQty, r.ngQty, r.bdMin, r.availability, r.performance, r.quality, r.oee].join(',')
    ),
  ]
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Props { lines: any[]; machines: any[] }

export function ReportClient({ lines, machines }: Props) {
  const { locale } = useI18n()
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [lineFilter, setLineFilter] = useState('all')

  const { data, isLoading } = useSWR(
    `/api/production/summary?from=${dateFrom}&to=${dateTo}${lineFilter !== 'all' ? `&lineId=${lineFilter}` : ''}`,
    fetcher,
  )

  const summary = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={22} className="text-blue-600" />
            {locale === 'th' ? 'รายงานสรุป' : 'Production Report'}
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
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
        <div>
          <label className="text-xs text-slate-500 block mb-1">{locale === 'th' ? 'สาย' : 'Line'}</label>
          <select value={lineFilter} onChange={e => setLineFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
            <option value="all">{locale === 'th' ? 'ทุกสาย' : 'All Lines'}</option>
            {lines.map((l: any) => <option key={l.id} value={l.id}>{l.lineCode}</option>)}
          </select>
        </div>
        <button
          onClick={() => {
            if (summary.length === 0) return
            const rows = summary.map((r: any) => ({ ...r, dateFrom, dateTo }))
            downloadCSV(rows, `production-report_${dateFrom}_${dateTo}.csv`)
          }}
          disabled={isLoading || summary.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-600" /></div>
      ) : summary.length === 0 ? (
        <div className="rounded-xl bg-white border py-16 text-center text-sm text-slate-400">
          {locale === 'th' ? 'ไม่มีข้อมูลในช่วงเวลาที่เลือก' : 'No data for selected period'}
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-3 text-left">{locale === 'th' ? 'สาย' : 'Line'}</th>
                <th className="px-4 py-3 text-left">{locale === 'th' ? 'เครื่อง' : 'Machine'}</th>
                <th className="px-4 py-3 text-right">Sessions</th>
                <th className="px-4 py-3 text-right">OK Qty</th>
                <th className="px-4 py-3 text-right">NG</th>
                <th className="px-4 py-3 text-right">BD (min)</th>
                <th className="px-4 py-3 text-right">Avail%</th>
                <th className="px-4 py-3 text-right">Perf%</th>
                <th className="px-4 py-3 text-right">Qual%</th>
                <th className="px-4 py-3 text-right">OEE%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summary.map((row: any) => (
                <tr key={row.machineId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{row.lineCode}</td>
                  <td className="px-4 py-3 font-medium">{row.mcNo}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.sessions}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.okQty.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-500">{row.ngQty}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-500">{row.bdMin}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.availability}%</td>
                  <td className="px-4 py-3 text-right font-mono">{row.performance}%</td>
                  <td className="px-4 py-3 text-right font-mono">{row.quality}%</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${getOeeBg(row.oee)} rounded px-2 py-0.5`}>{row.oee}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
