'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { calcOEE, calcAvailability, calcPerformance, calcQuality, getOeeBg } from '@/lib/utils/oee'
import {
  Activity, Cpu, AlertTriangle, CheckCircle2,
  TrendingUp, XCircle, Plus, History, FileBarChart,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

interface Props {
  sessions: any[]
  activeSessions: number
  unreadAlertsCount: number
  totalMachines: number
  userName: string
}

export function DashboardClient({ sessions, activeSessions, unreadAlertsCount, totalMachines, userName }: Props) {
  const { t, locale } = useI18n()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

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
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>{locale === 'th' ? 'อัพเดทล่าสุด' : 'Last updated'}</p>
          <p className="font-mono text-slate-700">{format(now, 'HH:mm:ss')}</p>
        </div>
      </div>

      {/* Quick Actions */}
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
          label={locale === 'th' ? 'ผลิตวันนี้' : 'Today Output'}
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
            {locale === 'th' ? 'เครื่องจักรที่กำลังผลิต' : 'Active Production Sessions'}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3 text-left">{t('machine')}</th>
                  <th className="px-4 py-3 text-left">{t('line')}</th>
                  <th className="px-4 py-3 text-right">{t('okQty')}</th>
                  <th className="px-4 py-3 text-right">{t('target')}</th>
                  <th className="px-4 py-3 text-right">Achievement</th>
                  <th className="px-4 py-3 text-center">BD</th>
                  <th className="px-4 py-3 text-center">NG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
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
                      <td className="px-4 py-3 font-medium text-slate-800">{machineLabel}</td>
                      <td className="px-4 py-3 text-slate-500">{sess.line?.lineCode ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono">{ok.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">{tgt.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${pct >= 100 ? 'text-green-600' : pct >= 85 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {pct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasBd ? <span className="text-red-500 font-medium">●</span> : <span className="text-slate-200">●</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
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
