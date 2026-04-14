'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n'
import { calcOEE, calcAvailability, calcPerformance, calcQuality, getOeeBg } from '@/lib/utils/oee'
import {
  Activity, Cpu, AlertTriangle, CheckCircle2,
  TrendingUp, XCircle, Plus, History, FileBarChart, CalendarDays,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/lib/utils/cn'
import { DASHBOARD_TABLE_BASE, DASHBOARD_TH_STICKY_SOFT_COMFORTABLE } from '@/lib/dashboard-sticky-table-classes'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(typeof j?.error === 'string' ? j.error : r.statusText)
  return j
}

interface Props {
  initialData: {
    mode: 'day' | 'month'
    from: string
    to: string
    sessions: any[]
    activeSessions: number
    unreadAlertsCount: number
    totalMachines: number
  }
  initialDate: string
  initialMonth: string
  userName: string
}

export function DashboardClient({ initialData, initialDate, initialMonth, userName }: Props) {
  const { t, locale } = useI18n()
  const [now, setNow] = useState(() => new Date())
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ mode })
    if (mode === 'day') p.set('date', selectedDate)
    else p.set('month', selectedMonth)
    return p.toString()
  }, [mode, selectedDate, selectedMonth])

  const { data, error, isLoading } = useSWR(`/api/production/dashboard?${qs}`, fetcher, {
    fallbackData: initialData,
    keepPreviousData: true,
  })

  const sessions = data?.sessions ?? []
  const activeSessions = data?.activeSessions ?? 0
  const unreadAlertsCount = data?.unreadAlertsCount ?? 0
  const totalMachines = data?.totalMachines ?? 0

  // สรุปภาพรวม
  const totalOk  = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) => r + hr.okQty, 0), 0)
  const totalNg  = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) =>
      r + hr.ngLogs.reduce((n: number, ng: any) => n + ng.ngQty, 0), 0), 0)
  const totalBd  = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) =>
      r + hr.breakdownLogs.reduce((b: number, bd: any) => b + bd.breakTimeMin, 0), 0), 0)
  const totalTarget = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) => r + hr.targetQty, 0), 0)
  const totalHours  = sessions.reduce((s: number, sess: any) => s + sess.totalHours, 0)

  const avail  = calcAvailability(totalHours * 60, totalBd)
  const perf   = calcPerformance(totalOk, totalTarget)
  const qual   = calcQuality(totalOk, totalNg)
  const oee    = calcOEE(avail, perf, qual)

  const unread = unreadAlertsCount
  const periodText =
    mode === 'day'
      ? (locale === 'th' ? `วันที่ ${selectedDate}` : `Date ${selectedDate}`)
      : (locale === 'th' ? `เดือน ${selectedMonth}` : `Month ${selectedMonth}`)

  const kpiCards = [
    { label: t('oee'),          value: `${oee}%`,   color: getOeeBg(oee),        icon: <TrendingUp size={20} /> },
    { label: t('availability'), value: `${avail}%`,  color: getOeeBg(avail),      icon: <Activity size={20} /> },
    { label: t('performance'),  value: `${perf}%`,   color: getOeeBg(perf),       icon: <TrendingUp size={20} /> },
    { label: t('quality'),      value: `${qual}%`,   color: getOeeBg(qual),       icon: <CheckCircle2 size={20} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {locale === 'th' ? `สวัสดี, ${userName}` : `Hello, ${userName}`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(now, 'EEEE d MMMM yyyy', { locale: locale === 'th' ? th : undefined })}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            <CalendarDays size={13} />
            {periodText}
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>{locale === 'th' ? 'อัพเดทล่าสุด' : 'Last updated'}</p>
          <p className="font-mono text-slate-700">{format(now, 'HH:mm:ss')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{locale === 'th' ? 'มุมมอง' : 'View'}</label>
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('day')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'day' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {locale === 'th' ? 'รายวัน' : 'Daily'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('month')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === 'month' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {locale === 'th' ? 'รายเดือน' : 'Monthly'}
                </button>
              </div>
            </div>
            {mode === 'day' ? (
              <div>
                <label className="mb-1 block text-xs text-slate-500">{locale === 'th' ? 'วันที่' : 'Date'}</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs text-slate-500">{locale === 'th' ? 'เดือน' : 'Month'}</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/production/record"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
              <Plus size={16} />
              {locale === 'th' ? 'บันทึกใหม่' : 'New Record'}
            </Link>
            <Link href="/production/history"
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
              <History size={16} />
              {locale === 'th' ? 'ดูประวัติ' : 'View History'}
            </Link>
            <Link href="/production/report"
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
              <FileBarChart size={16} />
              {locale === 'th' ? 'ดูรายงาน' : 'View Report'}
            </Link>
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600">{String(error.message ?? error)}</p>
        ) : null}
        {isLoading ? <p className="mt-2 text-xs text-slate-500">{locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}</p> : null}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label={locale === 'th' ? 'เครื่องที่ Active' : 'Active Machines'}
          value={activeSessions}
          sub={`/ ${totalMachines} ${locale === 'th' ? 'เครื่อง' : 'machines'}`}
          icon={<Cpu size={20} className="text-blue-600" />}
          bgColor="bg-blue-50"
        />
        <SummaryCard
          label={mode === 'day' ? (locale === 'th' ? 'ผลผลิตตามวันที่เลือก' : 'Output (selected day)') : (locale === 'th' ? 'ผลผลิตตามเดือนเลือก' : 'Output (selected month)')}
          value={totalOk.toLocaleString()}
          sub={locale === 'th' ? 'ชิ้น OK' : 'pcs OK'}
          icon={<CheckCircle2 size={20} className="text-green-600" />}
          bgColor="bg-green-50"
        />
        <SummaryCard
          label="NG"
          value={totalNg.toLocaleString()}
          sub={locale === 'th' ? 'ชิ้น NG' : 'pcs NG'}
          icon={<XCircle size={20} className="text-red-500" />}
          bgColor="bg-red-50"
        />
        <Link href="/alerts" className="block rounded-xl transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2">
          <SummaryCard
            label={locale === 'th' ? 'แจ้งเตือน' : 'Alerts'}
            value={unread}
            sub={locale === 'th' ? 'แตะเพื่อดูทั้งหมด' : 'Tap to view all'}
            icon={<AlertTriangle size={20} className="text-orange-500" />}
            bgColor="bg-orange-50"
          />
        </Link>
      </div>

      {/* KPI OEE */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-600 uppercase tracking-wide">
          KPI — {locale === 'th' ? 'ภาพรวมวันนี้' : "Today's Overview"}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiCards.map(k => (
            <div key={k.label} className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500">{k.label}</span>
                <div className={`rounded-lg p-1.5 ${k.color}`}>{k.icon}</div>
              </div>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active Sessions Table */}
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm">
        <Link href="/production/history" className="flex items-center justify-between border-b border-slate-100 px-5 py-3 hover:bg-slate-50 transition-colors">
          <h2 className="text-sm font-semibold text-slate-700">
            {mode === 'day'
              ? (locale === 'th' ? 'รายการ Session ตามวันที่เลือก' : 'Sessions on selected date')
              : (locale === 'th' ? 'รายการ Session ตามเดือนที่เลือก' : 'Sessions in selected month')}
          </h2>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {sessions.length} {locale === 'th' ? 'เครื่อง' : 'machines'}
          </span>
        </Link>

        {sessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {locale === 'th' ? 'ไม่มีเครื่องที่กำลังผลิตในขณะนี้' : 'No active sessions'}
          </div>
        ) : (
          <div className="w-full min-w-0">
            <table className={DASHBOARD_TABLE_BASE}>
              <thead>
                <tr>
                  {mode === 'month' ? <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'วันที่' : 'Date'}</th> : null}
                  <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{t('machine')}</th>
                  <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{t('line')}</th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>{t('okQty')}</th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>{t('target')}</th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>Achievement</th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-center')}>BD</th>
                  <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-center')}>NG</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess: any) => {
                  const ok      = sess.hourlyRecords.reduce((s: number, r: any) => s + r.okQty, 0)
                  const tgt     = sess.hourlyRecords.reduce((s: number, r: any) => s + r.targetQty, 0)
                  const ng      = sess.hourlyRecords.reduce((s: number, r: any) =>
                    s + r.ngLogs.reduce((n: number, ng: any) => n + ng.ngQty, 0), 0)
                  const hasBd   = sess.hourlyRecords.some((r: any) => r.hasBreakdown)
                  const pct     = tgt > 0 ? Math.round((ok / tgt) * 100) : 0

                  const machineLabel =
                    sess.machine?.mcNo ??
                    (locale === 'th' ? 'ทั้งสาย' : 'Line (no machine)')

                  return (
                    <tr key={sess.id} className="hover:bg-slate-50 transition-colors">
                      {mode === 'month' ? (
                        <td className="border border-slate-100 px-4 py-3 font-mono text-xs text-slate-500">
                          {String(sess.sessionDate).slice(0, 10)}
                        </td>
                      ) : null}
                      <td className="border border-slate-100 px-4 py-3 font-medium text-slate-800">{machineLabel}</td>
                      <td className="border border-slate-100 px-4 py-3 text-slate-500">{sess.line?.lineCode ?? '—'}</td>
                      <td className="border border-slate-100 px-4 py-3 text-right font-mono">{ok.toLocaleString()}</td>
                      <td className="border border-slate-100 px-4 py-3 text-right font-mono text-slate-400">{tgt.toLocaleString()}</td>
                      <td className="border border-slate-100 px-4 py-3 text-right">
                        <span className={`font-bold ${pct >= 100 ? 'text-green-600' : pct >= 85 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {pct}%
                        </span>
                      </td>
                      <td className="border border-slate-100 px-4 py-3 text-center">
                        {hasBd ? <span className="text-red-500 font-medium">●</span> : <span className="text-slate-200">●</span>}
                      </td>
                      <td className="border border-slate-100 px-4 py-3 text-center">
                        {ng > 0 ? <span className="text-orange-500 font-medium">{ng}</span> : <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

function SummaryCard({ label, value, sub, icon, bgColor }: {
  label: string; value: string | number; sub: string; icon: React.ReactNode; bgColor: string
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
          <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
        </div>
        <div className={`rounded-lg p-2 ${bgColor}`}>{icon}</div>
      </div>
    </div>
  )
}
