'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DASHBOARD_TABLE_BASE, DASHBOARD_TABLE_WRAP, DASHBOARD_TH_STICKY_SOFT_COMFORTABLE } from '@/lib/dashboard-sticky-table-classes'
import { cn } from '@/lib/utils/cn'

type TabKey = 'audit' | 'system' | 'notifications'

type AuditRow = {
  id: string
  action: string
  entity: string | null
  entityId: string | null
  details: unknown
  createdAt: string
  user?: { id?: string | null; employeeCode?: string | null; firstName?: string | null; lastName?: string | null } | null
}

type SystemRow = {
  id: string
  source: string
  category: string | null
  severity: 'INFO' | 'WARN' | 'ERROR'
  message: string
  details: unknown
  path: string | null
  method: string | null
  traceId: string | null
  createdAt: string
  user?: { employeeCode?: string | null; firstName?: string | null; lastName?: string | null } | null
}

type NotificationRow = {
  id: string
  type: string
  severity: 'INFO' | 'WARN' | 'ERROR'
  title: string
  message: string
  sentVia: string | null
  targetRole: string | null
  createdAt: string
  sessionId: string | null
}

function severityBadge(severity: 'INFO' | 'WARN' | 'ERROR') {
  if (severity === 'ERROR') return 'bg-red-100 text-red-700'
  if (severity === 'WARN') return 'bg-amber-100 text-amber-700'
  return 'bg-blue-100 text-blue-700'
}

const LOGS_STICKY_TH = `${DASHBOARD_TH_STICKY_SOFT_COMFORTABLE} top-0 z-30`

export function LogsClient() {
  const { locale, t } = useI18n()
  const isTh = locale === 'th'
  const todayBangkok = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()),
    [],
  )

  const [tab, setTab] = useState<TabKey>('audit')
  const [rangePreset, setRangePreset] = useState<'7' | '30'>('7')
  const [from, setFrom] = useState(todayBangkok)
  const [to, setTo] = useState(todayBangkok)
  const [severity, setSeverity] = useState('')
  const [auditAction, setAuditAction] = useState('')
  const [auditEntity, setAuditEntity] = useState('')
  const [auditUserQuery, setAuditUserQuery] = useState('')
  const [debouncedAuditUserQuery, setDebouncedAuditUserQuery] = useState('')
  const [source, setSource] = useState('')
  const [method, setMethod] = useState('')
  const [notifType, setNotifType] = useState('')
  const [sentVia, setSentVia] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [auditRows, setAuditRows] = useState<AuditRow[]>([])
  const [systemRows, setSystemRows] = useState<SystemRow[]>([])
  const [notificationRows, setNotificationRows] = useState<NotificationRow[]>([])
  const [selectedDetails, setSelectedDetails] = useState<unknown | null>(null)

  const title = useMemo(() => (isTh ? 'ศูนย์รวมระบบ Log' : 'Logs Center'), [isTh])
  const auditActionOptions = useMemo(
    () => Array.from(new Set(auditRows.map((row) => row.action).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [auditRows],
  )
  const auditEntityOptions = useMemo(
    () =>
      Array.from(new Set(auditRows.map((row) => row.entity).filter((v): v is string => Boolean(v)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [auditRows],
  )

  function endpointFor(nextTab: TabKey) {
    if (nextTab === 'audit') return '/api/admin/logs/audit'
    if (nextTab === 'system') return '/api/admin/logs/system-errors'
    return '/api/admin/logs/notifications'
  }

  function buildParams(nextTab: TabKey, exportMode: boolean = false) {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (!from && !to) params.set('range', rangePreset)

    if (nextTab === 'audit') {
      if (auditEntity) params.set('entity', auditEntity)
      if (auditAction) params.set('action', auditAction)
      if (debouncedAuditUserQuery) params.set('userQuery', debouncedAuditUserQuery)
    }
    if (nextTab === 'system') {
      if (severity) params.set('severity', severity)
      if (source) params.set('source', source)
      if (method) params.set('method', method)
    }
    if (nextTab === 'notifications') {
      if (notifType) params.set('type', notifType)
      if (sentVia) params.set('sentVia', sentVia)
    }

    if (exportMode) params.set('export', 'csv')
    else params.set('limit', '50')
    return params
  }

  async function loadData(nextTab: TabKey = tab) {
    setLoading(true)
    setError(null)
    try {
      const endpoint = endpointFor(nextTab)
      const params = buildParams(nextTab, false)
      const res = await fetch(`${endpoint}?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load logs')

      if (nextTab === 'audit') setAuditRows(json.data ?? [])
      else if (nextTab === 'system') setSystemRows(json.data ?? [])
      else setNotificationRows(json.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }

  async function exportExcel(nextTab: TabKey = tab) {
    const endpoint = endpointFor(nextTab)
    const params = buildParams(nextTab, true)
    const res = await fetch(`${endpoint}?${params.toString()}`)
    if (!res.ok) {
      setError(isTh ? 'ส่งออกไฟล์ไม่สำเร็จ' : 'Failed to export file')
      return
    }
    const csvText = await res.text()
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(csvText, { type: 'string' })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const fileBase = nextTab === 'audit' ? 'audit-logs' : nextTab === 'system' ? 'system-logs' : 'notification-logs'
    XLSX.writeFile(workbook, `${fileBase}-${stamp}.xlsx`)
  }

  function switchTab(nextTab: TabKey) {
    setTab(nextTab)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAuditUserQuery(auditUserQuery.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [auditUserQuery])

  useEffect(() => {
    void loadData(tab)
    // auto refresh when selected filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, from, to, rangePreset, auditEntity, auditAction, debouncedAuditUserQuery, severity, source, method, notifType, sentVia])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{isTh ? 'Audit / System Error / Notification logs' : 'Audit / System Error / Notification logs'}</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => switchTab('audit')}>
          Audit Log
        </button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === 'system' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => switchTab('system')}>
          System Error Log
        </button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === 'notifications' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => switchTab('notifications')}>
          Notification Log
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          value={rangePreset}
          onChange={(e) => setRangePreset(e.target.value === '30' ? '30' : '7')}
        >
          <option value="7">{isTh ? 'ย้อนหลัง 7 วัน (default)' : 'Last 7 days (default)'}</option>
          <option value="30">{isTh ? 'ย้อนหลัง 30 วัน' : 'Last 30 days'}</option>
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void exportExcel()}>{isTh ? 'Export Excel' : 'Export Excel'}</Button>
        </div>
      </div>

      {tab === 'audit' ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <select className="rounded border border-slate-300 px-2 py-2 text-sm" value={auditEntity} onChange={(e) => setAuditEntity(e.target.value)}>
            <option value="">{isTh ? 'Entity ทั้งหมด' : 'All entities'}</option>
            {auditEntityOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className="rounded border border-slate-300 px-2 py-2 text-sm" value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
            <option value="">{isTh ? 'Action ทั้งหมด' : 'All actions'}</option>
            {auditActionOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Input
            placeholder={isTh ? 'ค้นหา User (รหัส/ชื่อ/นามสกุล)' : 'Search user (employee code/name)'}
            value={auditUserQuery}
            onChange={(e) => setAuditUserQuery(e.target.value)}
          />
        </div>
      ) : null}

      {tab === 'system' ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <select className="rounded border border-slate-300 px-2 py-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">{isTh ? 'Severity ทั้งหมด' : 'All severities'}</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <Input
            placeholder={isTh ? 'กรอง Source เช่น notifications.check' : 'Filter source e.g. notifications.check'}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <select className="rounded border border-slate-300 px-2 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">{isTh ? 'Method ทั้งหมด' : 'All methods'}</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
      ) : null}

      {tab === 'notifications' ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
          <select className="rounded border border-slate-300 px-2 py-2 text-sm" value={notifType} onChange={(e) => setNotifType(e.target.value)}>
            <option value="">{isTh ? 'Type ทั้งหมด' : 'All types'}</option>
            <option value="MISSING_RECORD">MISSING_RECORD</option>
            <option value="LOW_PRODUCTION">LOW_PRODUCTION</option>
            <option value="HIGH_NG">HIGH_NG</option>
            <option value="LONG_BREAKDOWN">LONG_BREAKDOWN</option>
            <option value="SYSTEM">SYSTEM</option>
          </select>
          <Input
            placeholder={isTh ? 'กรอง Sent Via เช่น BOTH/TELEGRAM' : 'Filter sent via e.g. BOTH/TELEGRAM'}
            value={sentVia}
            onChange={(e) => setSentVia(e.target.value)}
          />
          <div />
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {tab === 'audit' ? (
        <div className={cn(DASHBOARD_TABLE_WRAP, 'relative max-h-[65vh] overflow-auto')}>
          <table className={cn(DASHBOARD_TABLE_BASE, 'min-w-[64rem]')}>
            <thead>
              <tr>
                <th className={LOGS_STICKY_TH}>Time</th>
                <th className={LOGS_STICKY_TH}>Entity</th>
                <th className={LOGS_STICKY_TH}>Action</th>
                <th className={LOGS_STICKY_TH}>Entity ID</th>
                <th className={LOGS_STICKY_TH}>User</th>
                <th className={LOGS_STICKY_TH}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-100 px-4 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.entity ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm font-medium">{row.action}</td>
                  <td className="border border-slate-100 px-4 py-2 text-xs">{row.entityId ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.user?.employeeCode ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDetails(row.details)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'system' ? (
        <div className={cn(DASHBOARD_TABLE_WRAP, 'relative max-h-[65vh] overflow-auto')}>
          <table className={cn(DASHBOARD_TABLE_BASE, 'min-w-[72rem]')}>
            <thead>
              <tr>
                <th className={LOGS_STICKY_TH}>Time</th>
                <th className={LOGS_STICKY_TH}>Severity</th>
                <th className={LOGS_STICKY_TH}>Source</th>
                <th className={LOGS_STICKY_TH}>Message</th>
                <th className={LOGS_STICKY_TH}>Path</th>
                <th className={LOGS_STICKY_TH}>User</th>
                <th className={LOGS_STICKY_TH}>Details</th>
              </tr>
            </thead>
            <tbody>
              {systemRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-100 px-4 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="border border-slate-100 px-4 py-2 text-xs">
                    <span className={cn('rounded px-2 py-0.5 font-semibold', severityBadge(row.severity))}>{row.severity}</span>
                  </td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.source}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.message}</td>
                  <td className="border border-slate-100 px-4 py-2 text-xs">{row.method ? `${row.method} ` : ''}{row.path ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.user?.employeeCode ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDetails(row.details)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'notifications' ? (
        <div className={cn(DASHBOARD_TABLE_WRAP, 'relative max-h-[65vh] overflow-auto')}>
          <table className={cn(DASHBOARD_TABLE_BASE, 'min-w-[68rem]')}>
            <thead>
              <tr>
                <th className={LOGS_STICKY_TH}>Time</th>
                <th className={LOGS_STICKY_TH}>Type</th>
                <th className={LOGS_STICKY_TH}>Severity</th>
                <th className={LOGS_STICKY_TH}>Title</th>
                <th className={LOGS_STICKY_TH}>Target Role</th>
                <th className={LOGS_STICKY_TH}>Sent Via</th>
                <th className={LOGS_STICKY_TH}>Details</th>
              </tr>
            </thead>
            <tbody>
              {notificationRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-100 px-4 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.type}</td>
                  <td className="border border-slate-100 px-4 py-2 text-xs">
                    <span className={cn('rounded px-2 py-0.5 font-semibold', severityBadge(row.severity))}>{row.severity}</span>
                  </td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.title}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.targetRole ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">{row.sentVia ?? '-'}</td>
                  <td className="border border-slate-100 px-4 py-2 text-sm">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDetails({ message: row.message, sessionId: row.sessionId })}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedDetails !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{isTh ? 'รายละเอียด Log' : 'Log Details'}</h3>
            <Button variant="outline" size="sm" onClick={() => setSelectedDetails(null)}>{t('close')}</Button>
          </div>
          <pre className="max-h-[20rem] overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(selectedDetails, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

