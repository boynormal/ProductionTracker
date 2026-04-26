'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n'
import { calcOEE, calcAvailability, calcPerformance, calcQuality, getOeeBg } from '@/lib/utils/oee'
import {
  Activity, Cpu, AlertTriangle, CheckCircle2, Wrench, Clock,
  TrendingUp, XCircle, Plus, History, FileBarChart, CalendarDays,
  ChevronRight, RefreshCw,
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
    divisionId: string | null
    sectionId: string | null
    sessions: any[]
    activeSessions: number
    unreadAlertsCount: number
    totalMachines: number
  }
  initialDate: string
  initialMonth: string
  divisions: { id: string; divisionCode: string; divisionName: string }[]
  sections: { id: string; sectionCode: string; sectionName: string; division?: { id: string | null } | null }[]
  userName: string
}

export function DashboardClient({
  initialData,
  initialDate,
  initialMonth,
  divisions,
  sections,
  userName,
}: Props) {
  const { t, locale } = useI18n()
  const [now, setNow] = useState(() => new Date())
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [divisionId, setDivisionId] = useState(initialData.divisionId ?? '')
  const [sectionId, setSectionId] = useState(initialData.sectionId ?? '')

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const filteredSections = useMemo(() => {
    if (!divisionId) return sections
    return sections.filter((s) => s.division?.id === divisionId)
  }, [divisionId, sections])

  useEffect(() => {
    if (sectionId && !filteredSections.some((s) => s.id === sectionId)) {
      setSectionId('')
    }
  }, [filteredSections, sectionId])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ mode })
    if (mode === 'day') p.set('date', selectedDate)
    else p.set('month', selectedMonth)
    if (divisionId) p.set('divisionId', divisionId)
    if (sectionId) p.set('sectionId', sectionId)
    return p.toString()
  }, [mode, selectedDate, selectedMonth, divisionId, sectionId])

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
  const totalFailures = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) => r + hr.breakdownLogs.length, 0), 0)
  const totalTarget = sessions.reduce((s: number, sess: any) =>
    s + sess.hourlyRecords.reduce((r: number, hr: any) => r + hr.targetQty, 0), 0)
  const totalHours  = sessions.reduce((s: number, sess: any) => s + sess.totalHours, 0)
  const totalDowntimeHr = totalBd / 60
  const totalUptimeHr = Math.max(0, totalHours - totalDowntimeHr)

  const avail  = calcAvailability(totalHours * 60, totalBd)
  const perf   = calcPerformance(totalOk, totalTarget)
  const qual   = calcQuality(totalOk, totalNg)
  const oee    = calcOEE(avail, perf, qual)
  const mtbf   = totalFailures > 0 ? Math.round((totalUptimeHr / totalFailures) * 100) / 100 : Math.round(totalHours * 100) / 100
  const mttr   = totalFailures > 0 ? Math.round((totalDowntimeHr / totalFailures) * 100) / 100 : 0

  const unread = unreadAlertsCount
  const divisionLabel = divisionId
    ? divisions.find((d) => d.id === divisionId)?.divisionName ?? ''
    : ''
  const sectionLabel = sectionId
    ? sections.find((s) => s.id === sectionId)?.sectionName ?? ''
    : ''
  const periodText =
    mode === 'day'
      ? (locale === 'th' ? `วันที่ ${selectedDate}` : `Date ${selectedDate}`)
      : (locale === 'th' ? `เดือน ${selectedMonth}` : `Month ${selectedMonth}`)
  const filterDivisionText =
    divisionLabel &&
    (locale === 'th' ? ` · ฝ่าย ${divisionLabel}` : ` · ${divisionLabel}`)
  const filterSectionText =
    sectionLabel &&
    (locale === 'th' ? ` · ส่วน ${sectionLabel}` : ` · ${sectionLabel}`)

  const kpiCards = [
    { label: t('oee'),          value: `${oee}%`,   color: getOeeBg(oee),        icon: <TrendingUp size={20} /> },
    { label: t('availability'), value: `${avail}%`,  color: getOeeBg(avail),      icon: <Activity size={20} /> },
    { label: t('performance'),  value: `${perf}%`,   color: getOeeBg(perf),       icon: <TrendingUp size={20} /> },
    { label: t('quality'),      value: `${qual}%`,   color: getOeeBg(qual),       icon: <CheckCircle2 size={20} /> },
  ]

  return (
    <div className="space-y-5">

      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            {locale === 'th' ? `สวัสดี, ${userName}` : `Hello, ${userName}`}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {format(now, 'EEEE d MMMM yyyy', { locale: locale === 'th' ? th : undefined })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              <CalendarDays size={11} />
              {periodText}
            </span>
            {divisionLabel && (
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {locale === 'th' ? 'ฝ่าย' : 'Div'}: {divisionLabel}
              </span>
            )}
            {sectionLabel && (
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {locale === 'th' ? 'ส่วน' : 'Sec'}: {sectionLabel}
              </span>
            )}
            {isLoading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-400">
                <RefreshCw size={9} className="animate-spin" />
                {locale === 'th' ? 'โหลด...' : 'Loading...'}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 rounded-2xl border border-slate-100 bg-white px-5 py-3 text-right shadow-sm">
          <p className="font-mono text-3xl font-bold tabular-nums text-slate-700">{format(now, 'HH:mm')}</p>
          <p className="text-[11px] text-slate-400">{locale === 'th' ? 'อัพเดทล่าสุด' : 'Last updated'}</p>
        </div>
      </div>

      {/* ── FILTER + ACTIONS BAR ── */}
      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <FilterField label={locale === 'th' ? 'มุมมอง' : 'View'}>
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button type="button" onClick={() => setMode('day')}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                    mode === 'day' ? 'bg-white text-blue-600 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {locale === 'th' ? 'รายวัน' : 'Daily'}
                </button>
                <button type="button" onClick={() => setMode('month')}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                    mode === 'month' ? 'bg-white text-blue-600 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {locale === 'th' ? 'รายเดือน' : 'Monthly'}
                </button>
              </div>
            </FilterField>
            <FilterField label={mode === 'day' ? (locale === 'th' ? 'วันที่' : 'Date') : (locale === 'th' ? 'เดือน' : 'Month')}>
              {mode === 'day' ? (
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              ) : (
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              )}
            </FilterField>
            <FilterField label={locale === 'th' ? 'ฝ่าย' : 'Division'}>
              <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}
                className="h-9 min-w-[11rem] rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">{locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.divisionCode} — {d.divisionName}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label={locale === 'th' ? 'ส่วน' : 'Section'}>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}
                className="h-9 min-w-[10rem] rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">{locale === 'th' ? 'ทั้งหมด' : 'All'}</option>
                {filteredSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.sectionCode} — {s.sectionName}</option>
                ))}
              </select>
            </FilterField>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/production/record"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
              <Plus size={15} />
              {locale === 'th' ? 'บันทึกใหม่' : 'New Record'}
            </Link>
            <Link href="/production/history"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <History size={15} />
              {locale === 'th' ? 'ประวัติ' : 'History'}
            </Link>
            <Link href="/production/report"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <FileBarChart size={15} />
              {locale === 'th' ? 'รายงาน' : 'Report'}
            </Link>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-500">{String(error.message ?? error)}</p> : null}
      </div>

      {/* ── OEE KPI CARDS ── */}
      <section>
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">OEE Performance</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiCards.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />
          ))}
        </div>
      </section>

      {/* ── PRODUCTION SUMMARY CARDS ── */}
      <section>
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {locale === 'th' ? 'สรุปการผลิต' : 'Production Summary'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label={locale === 'th' ? 'Session ที่รัน' : 'Active Sessions'}
            value={activeSessions}
            sub={`/ ${totalMachines} ${locale === 'th' ? 'เครื่อง' : 'machines'}`}
            icon={<Cpu size={18} />} accent="blue" />
          <MetricCard
            label={locale === 'th' ? 'ผลผลิต OK' : 'Output OK'}
            value={totalOk.toLocaleString()}
            sub={locale === 'th' ? 'ชิ้น' : 'pcs'}
            icon={<CheckCircle2 size={18} />} accent="green" />
          <MetricCard
            label="NG"
            value={totalNg.toLocaleString()}
            sub={locale === 'th' ? 'ชิ้น NG' : 'pcs NG'}
            icon={<XCircle size={18} />} accent="red" />
          <MetricCard
            label="MTBF"
            value={mtbf.toFixed(2)}
            sub={locale === 'th' ? 'ชม./เหตุเสีย' : 'hrs / failure'}
            icon={<Clock size={18} />} accent="indigo" />
          <MetricCard
            label="MTTR"
            value={mttr.toFixed(2)}
            sub={locale === 'th' ? 'ชม.ซ่อมเฉลี่ย' : 'avg repair hrs'}
            icon={<Wrench size={18} />} accent="amber" />
          <Link href="/alerts" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-2xl">
            <MetricCard
              label={locale === 'th' ? 'แจ้งเตือน' : 'Alerts'}
              value={unread}
              sub={locale === 'th' ? 'กดเพื่อดูทั้งหมด' : 'Tap to view all'}
              icon={<AlertTriangle size={18} />} accent="orange" clickable />
          </Link>
        </div>
      </section>

      {/* ── SESSIONS TABLE ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              {mode === 'day'
                ? (locale === 'th' ? 'รายการ Session วันที่เลือก' : 'Sessions — Selected Date')
                : (locale === 'th' ? 'รายการ Session เดือนที่เลือก' : 'Sessions — Selected Month')}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">{periodText}{filterDivisionText}{filterSectionText}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              {sessions.length} {locale === 'th' ? 'รายการ' : 'sessions'}
            </span>
            <Link href="/production/history"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors">
              {locale === 'th' ? 'ดูทั้งหมด' : 'View all'}
              <ChevronRight size={12} />
            </Link>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Cpu size={36} className="mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">
              {locale === 'th' ? 'ไม่มี Session ในช่วง/ตัวกรองที่เลือก' : 'No sessions for the selected period'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                  const ok    = sess.hourlyRecords.reduce((s: number, r: any) => s + r.okQty, 0)
                  const tgt   = sess.hourlyRecords.reduce((s: number, r: any) => s + r.targetQty, 0)
                  const ng    = sess.hourlyRecords.reduce((s: number, r: any) =>
                    s + r.ngLogs.reduce((n: number, ng: any) => n + ng.ngQty, 0), 0)
                  const hasBd = sess.hourlyRecords.some((r: any) => r.hasBreakdown)
                  const pct   = tgt > 0 ? Math.round((ok / tgt) * 100) : 0
                  const machineLabel = sess.machine?.mcNo ?? (locale === 'th' ? 'ทั้งสาย' : 'Line')
                  return (
                    <tr key={sess.id} className="hover:bg-blue-50/30 transition-colors">
                      {mode === 'month' ? (
                        <td className="border-b border-slate-100 px-4 py-3 font-mono text-xs text-slate-400">
                          {String(sess.reportingDate ?? sess.sessionDate).slice(0, 10)}
                        </td>
                      ) : null}
                      <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">{machineLabel}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {sess.line?.lineCode ?? '—'}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-right font-mono font-semibold text-slate-800">
                        {ok.toLocaleString()}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-right font-mono text-slate-400">
                        {tgt.toLocaleString()}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-right">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
                          pct >= 100 ? 'bg-emerald-100 text-emerald-700' :
                          pct >= 85  ? 'bg-amber-100 text-amber-700' :
                                       'bg-red-100 text-red-600'
                        )}>
                          {pct}%
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-center">
                        {hasBd
                          ? <span className="inline-flex h-5 w-8 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">BD</span>
                          : <span className="text-slate-200 text-xs">—</span>}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-center">
                        {ng > 0
                          ? <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-100 px-1.5 text-xs font-bold text-orange-600">{ng}</span>
                          : <span className="text-slate-200 text-xs">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function KpiCard({ label, value, color, icon }: {
  label: string; value: string; color: string; icon: React.ReactNode
}) {
  const num = parseFloat(value)
  const barColor = num >= 85 ? 'bg-emerald-400' : num >= 65 ? 'bg-amber-400' : 'bg-red-400'
  const textCls = color.split(' ').find((c) => c.startsWith('text-')) ?? 'text-slate-800'
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <div className={cn('rounded-xl p-2', color)}>{icon}</div>
      </div>
      <p className={cn('text-4xl font-black tracking-tight leading-none', textCls)}>{value}</p>
      {!isNaN(num) && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(100, num)}%` }}
          />
        </div>
      )}
    </div>
  )
}

type Accent = 'blue' | 'green' | 'red' | 'indigo' | 'amber' | 'orange'
const accentMap: Record<Accent, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-50',    text: 'text-blue-600' },
  green:  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  red:    { bg: 'bg-red-50',     text: 'text-red-500' },
  indigo: { bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  amber:  { bg: 'bg-amber-50',   text: 'text-amber-600' },
  orange: { bg: 'bg-orange-50',  text: 'text-orange-500' },
}

function MetricCard({ label, value, sub, icon, accent, clickable }: {
  label: string; value: string | number; sub: string
  icon: React.ReactNode; accent: Accent; clickable?: boolean
}) {
  const ac = accentMap[accent]
  return (
    <div className={cn(
      'rounded-2xl border border-slate-100 bg-white p-4 shadow-sm',
      clickable && 'transition-transform hover:-translate-y-0.5 hover:shadow-md'
    )}>
      <div className={cn('mb-3 inline-flex rounded-xl p-2', ac.bg)}>
        <span className={ac.text}>{icon}</span>
      </div>
      <p className="text-2xl font-bold leading-none text-slate-800">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </div>
  )
}
