'use client'

import { useMemo, useState, Fragment, type ReactNode } from 'react'
import useSWR from 'swr'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  PieChart,
  Pie,
} from 'recharts'

const BD_DONUT_COLORS = [
  '#ea580c',
  '#f59e0b',
  '#0891b2',
  '#6366f1',
  '#db2777',
  '#16a34a',
  '#64748b',
  '#b45309',
] as const
import { format } from 'date-fns'
import { BarChart3, Loader2, Users, Package, Cog, Search, Download, Wrench, XCircle, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportDayPicker } from '@/components/production/ReportDayPicker'
import { cn } from '@/lib/utils/cn'
import {
  DASHBOARD_MATRIX_TH_HEAD,
  DASHBOARD_TABLE_REPORT,
  DASHBOARD_TABLE_WRAP,
  DASHBOARD_TH_STICKY_SOFT,
  DASHBOARD_THEAD_STICKY,
} from '@/lib/dashboard-sticky-table-classes'
import {
  MAX_PRODUCTION_REPORT_RANGE_DAYS,
  isProductionReportRangeAllowed,
} from '@/lib/constants/production-reports'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(typeof j?.error === 'string' ? j.error : r.statusText)
  return j
}

type Granularity = 'day' | 'month'

function monthPickerToRange(ym: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim())
  if (!m) return null
  const y = +m[1]
  const mo = +m[2]
  if (mo < 1 || mo > 12) return null
  const first = `${y}-${String(mo).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const last = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from: first, to: last }
}

interface Props {
  divisions: { id: string; divisionCode: string; divisionName: string; departmentId: string }[]
  sections: { id: string; sectionCode: string; sectionName: string; divisionId: string }[]
}

function matchesOperatorSearch(query: string, name: string, employeeCode: string): boolean {
  const q = query.trim()
  if (!q) return true
  const ql = q.toLowerCase()
  return (
    name.includes(q) ||
    employeeCode.includes(q) ||
    name.toLowerCase().includes(ql) ||
    employeeCode.toLowerCase().includes(ql)
  )
}

export function ReportClient({ divisions, sections }: Props) {
  const { locale } = useI18n()
  const th = locale === 'th'

  const todayYmd = format(new Date(), 'yyyy-MM-dd')
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [operatorSearch, setOperatorSearch] = useState('')
  const [bdView, setBdView] = useState<'daily' | 'monthly' | 'yearly'>('daily')
  const [heatmapYear, setHeatmapYear] = useState(() => new Date().getFullYear())
  const [heatmapLineFilter, setHeatmapLineFilter] = useState('all')

  const filteredSections = useMemo(() => {
    if (divisionFilter !== 'all') return sections.filter((s) => s.divisionId === divisionFilter)
    return sections
  }, [sections, divisionFilter])

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      granularity,
    })
    if (sectionFilter !== 'all') p.set('sectionId', sectionFilter)
    else if (divisionFilter !== 'all') p.set('divisionId', divisionFilter)
    return p.toString()
  }, [dateFrom, dateTo, sectionFilter, divisionFilter, granularity])

  const rangeOk =
    granularity === 'month' || isProductionReportRangeAllowed(dateFrom, dateTo)

  const swrKey = rangeOk ? `/api/production/reports?${qs}` : null
  const { data, error, isLoading, isValidating } = useSWR(swrKey, fetcher, {
    keepPreviousData: true,
  })

  // Separate year-scoped fetch for heatmap view — fires only when heatmap tab is active
  const heatmapQs = useMemo(() => {
    const p = new URLSearchParams({
      from: `${heatmapYear}-01-01`,
      to: `${heatmapYear}-12-31`,
      granularity: 'day',
    })
    if (sectionFilter !== 'all') p.set('sectionId', sectionFilter)
    else if (divisionFilter !== 'all') p.set('divisionId', divisionFilter)
    return p.toString()
  }, [heatmapYear, sectionFilter, divisionFilter])

  const { data: heatmapData, isLoading: heatmapLoading } = useSWR(
    bdView === 'yearly' ? `/api/production/reports?${heatmapQs}` : null,
    fetcher,
    { keepPreviousData: true },
  )
  const heatmapRows: ByLineBreakdownRow[] = heatmapData?.byLineBreakdown ?? []
  const availableHeatmapLines = useMemo(
    () => [...new Set(heatmapRows.map((r) => r.lineCode))].sort(),
    [heatmapRows],
  )

  const payload = rangeOk ? data : undefined
  const byOperator = payload?.byOperator ?? []
  const byPart = payload?.byPart ?? []
  const byLineBreakdown: ByLineBreakdownRow[] = payload?.byLineBreakdown ?? []
  const breakdownCategories: BreakdownCategoryMeta[] = payload?.breakdownCategories ?? []
  const breakdownByLine = useMemo(
    () => aggregateBreakdownByLine(byLineBreakdown),
    [byLineBreakdown],
  )
  const byLineNg: ByLineNgRow[] = payload?.byLineNg ?? []
  const byLineIdleRaw: ByLineIdleRow[] = payload?.byLineIdle ?? []
  type LineIdleSortKey = keyof ByLineIdleRow
  const [lineIdleSortKey, setLineIdleSortKey] = useState<LineIdleSortKey>('utilizationPct')
  const [lineIdleSortDir, setLineIdleSortDir] = useState<'asc' | 'desc'>('asc')
  const byLineIdle = useMemo(() => {
    const key = lineIdleSortKey
    const dir = lineIdleSortDir === 'asc' ? 1 : -1
    return [...byLineIdleRaw].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (typeof av === 'string' && typeof bv === 'string')
        return dir * av.localeCompare(bv, 'th', { numeric: true })
      return dir * ((av as number) - (bv as number))
    })
  }, [byLineIdleRaw, lineIdleSortKey, lineIdleSortDir])
  const toggleLineIdleSort = (key: LineIdleSortKey) => {
    if (lineIdleSortKey === key) {
      setLineIdleSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setLineIdleSortKey(key)
      setLineIdleSortDir('asc')
    }
  }
  const operatorMonthMatrix = payload?.operatorMonthMatrix ?? null
  const rangeError =
    !rangeOk && granularity === 'day'
      ? th
        ? `ช่วงวันที่ยาวเกิน ${MAX_PRODUCTION_REPORT_RANGE_DAYS} วัน — แบ่งดูทีละไม่เกิน 1 ปีต่อครั้ง`
        : `Date range exceeds ${MAX_PRODUCTION_REPORT_RANGE_DAYS} days — use at most one year per request`
      : null
  const apiError = rangeError ?? payload?.error ?? error?.message

  const filteredByOperator = useMemo(
    () =>
      byOperator.filter((r: { name: string; employeeCode: string }) =>
        matchesOperatorSearch(operatorSearch, r.name, r.employeeCode),
      ),
    [byOperator, operatorSearch],
  )

  const filteredOperatorMatrix = useMemo(() => {
    if (!operatorMonthMatrix) return null
    const rows = operatorMonthMatrix.rows.filter((r: { name: string; employeeCode: string }) =>
      matchesOperatorSearch(operatorSearch, r.name, r.employeeCode),
    )
    return { ...operatorMonthMatrix, rows }
  }, [operatorMonthMatrix, operatorSearch])

  const operatorDailyEmptyMessage = useMemo(() => {
    if (byOperator.length === 0) return th ? 'ไม่มีข้อมูลพนักงานในช่วงนี้' : 'No operator data'
    if (filteredByOperator.length === 0) return th ? 'ไม่พบรายชื่อตามคำค้นหา' : 'No operators match your search'
    return ''
  }, [byOperator.length, filteredByOperator.length, th])

  const operatorMatrixEmptyMessage = useMemo(() => {
    if (!operatorMonthMatrix || operatorMonthMatrix.rows.length === 0) {
      return th ? 'ไม่มีข้อมูลพนักงานในเดือนนี้' : 'No operator data this month'
    }
    if ((filteredOperatorMatrix?.rows.length ?? 0) === 0) {
      return th ? 'ไม่พบรายชื่อตามคำค้นหา' : 'No operators match your search'
    }
    return ''
  }, [operatorMonthMatrix, filteredOperatorMatrix, th])

  const periodLabel = granularity === 'month' ? (th ? 'เดือน' : 'Month') : th ? 'วันที่' : 'Date'

  const fetchFailed = Boolean(error)
  const hasPayload = payload != null && !fetchFailed
  const operatorsReportEmpty =
    granularity === 'month'
      ? (operatorMonthMatrix?.rows?.length ?? 0) === 0
      : byOperator.length === 0
  const allEmpty =
    hasPayload &&
    operatorsReportEmpty &&
    byPart.length === 0 &&
    byLineIdle.length === 0 &&
    byLineBreakdown.length === 0 &&
    byLineNg.length === 0
  const showLoadingBlock = isLoading && !payload && !fetchFailed

  const exportExcel = async () => {
    if (!payload) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const nowStamp = format(new Date(), 'yyyyMMdd_HHmm')

    // Sheet 1: Operators
    if (granularity === 'month' && filteredOperatorMatrix) {
      const dayCols = Array.from({ length: filteredOperatorMatrix.daysInMonth }, (_, i) => i + 1)
      const header = [th ? 'รหัสพนักงาน' : 'Employee Code', th ? 'ชื่อพนักงาน' : 'Operator', ...dayCols.map(String)]
      const rows = filteredOperatorMatrix.rows.map((row: any) => [
        row.employeeCode,
        row.name,
        ...row.cells.map((c: any) =>
          c.parts.length
            ? c.parts.map((p: any) => `${p.partSamco} (${p.okQty.toLocaleString()} ${th ? 'ชิ้น' : 'pcs'})`).join('\n')
            : '',
        ),
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Operators')
    } else {
      const header = [th ? 'ชื่อพนักงาน' : 'Operator', th ? 'รหัส' : 'Code', 'Part', periodLabel, th ? 'OK' : 'OK Qty']
      const rows = filteredByOperator.map((r: any) => [r.name, r.employeeCode, `${r.partSamco} - ${r.partName}`, r.period, r.okQty])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Operators')
    }

    // Sheet 2: Parts
    {
      const header = [th ? 'Part Samco' : 'Part Samco', th ? 'ชื่อ Part' : 'Part Name', periodLabel, th ? 'OK' : 'OK Qty']
      const rows = byPart.map((r: any) => [r.partSamco, r.partName, r.period, r.okQty])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Parts')
    }

    // Sheet 3: Lines — Idle Hours
    {
      const header = [
        th ? 'ไลน์' : 'Line',
        th ? 'วันที่ขึ้นงาน' : 'Session days',
        th ? 'วันไม่ขึ้นงาน' : 'No-session days',
        th ? '% วันที่ขึ้นงาน' : 'Session days %',
        th ? 'ชม.แผน (ปกติ)' : 'Planned (hr)',
        th ? 'ชม.บันทึก' : 'Recorded (hr)',
        th ? 'ชม.หยุด (BD)' : 'Downtime (hr)',
        th ? 'ชม.เดินเครื่อง' : 'Running (hr)',
        th ? 'ชม.ว่าง (ไม่บันทึก)' : 'Unrecorded (hr)',
        th ? '% เดินเครื่อง' : 'Running %',
      ]
      const rows = byLineIdle.map((r) => [
        r.lineCode,
        r.sessionDays,
        r.noSessionDays,
        r.sessionDayPct,
        r.normalCapacity,
        r.normalHoursUsed,
        r.breakdownHours,
        r.usedHours,
        r.inShiftIdleHours,
        r.utilizationPct,
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, th ? 'ชม.ว่างไลน์' : 'Line Idle')
    }

    // Sheet 4: Breakdown — one row per line + category downtime hours
    {
      const catCodes = breakdownCategories.map((c) => displayBdCategoryCode(c.code))
      const header = [
        th ? 'ไลน์' : 'Line',
        th ? 'เวลาทำงาน (บันทึก)' : 'Working (recorded)',
        th ? 'เวลาเดินเครื่องจักร' : 'Machine running',
        th ? 'เวลาหยุดรวม' : 'Total downtime',
        th ? 'เวลาหยุดรวม %' : 'Downtime %',
        ...catCodes,
      ]
      const rows = breakdownByLine.map((r) => {
        const workHr = r.workHours
        const downHr = r.bdMin / 60
        const runningHr = Math.max(0, workHr - downHr)
        const downPct = workHr > 0 ? (downHr / workHr) * 100 : null
        return [
          r.lineCode,
          Number(formatBdHours(workHr)),
          Number(formatBdHours(runningHr)),
          Number(formatBdHours(downHr)),
          downPct != null ? Number(downPct.toFixed(2)) : '',
          ...breakdownCategories.map((c) =>
            Number(formatBdHours((r.catBdMin.get(c.id) ?? 0) / 60)),
          ),
        ]
      })
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Breakdown')
    }

    // Sheet 5: Defect
    {
      const header = [
        th ? 'ไลน์' : 'Line',
        periodLabel,
        th ? 'Defect (ชิ้น)' : 'Defect qty',
        th ? 'OK (ชิ้น)' : 'OK qty',
        'Defect Rate%',
        th ? 'จำนวน Part' : '# Parts',
        th ? 'Part หลัก' : 'Top Part',
      ]
      const rows = byLineNg.map((r) => [
        r.lineCode,
        r.period,
        r.ngQty,
        r.okQty,
        Number((r.ngRate * 100).toFixed(2)),
        r.defectivePartCount ?? r.parts?.length ?? 0,
        formatTopPartPlain(r.topPart),
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, 'Defect')
    }

    // Sheet 6: Defect by Part
    {
      const header = [
        th ? 'ไลน์' : 'Line',
        periodLabel,
        th ? 'Part Samco' : 'Part Samco',
        th ? 'ชื่อ Part' : 'Part Name',
        th ? 'Defect (ชิ้น)' : 'Defect qty',
        th ? 'OK (ชิ้น)' : 'OK qty',
      ]
      const rows: (string | number)[][] = []
      for (const r of byLineNg) {
        for (const p of r.parts ?? []) {
          rows.push([r.lineCode, r.period, p.partSamco, p.partName, p.ngQty, p.okQty ?? 0])
        }
      }
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, th ? 'Defect ตาม Part' : 'Defect by Part')
    }

    XLSX.writeFile(wb, `production_report_${nowStamp}.xlsx`)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <BarChart3 size={22} className="text-blue-600" />
          {th ? 'รายงานการผลิต' : 'Production reports'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {th
            ? 'สรุปจาก Session ที่กำลังเปิดกะหรือปิดกะแล้ว (ไม่รวมที่ยกเลิก) — เลือกวันที่หรือเดือน แล้วดูรายละเอียดในแท็บด้านล่าง'
            : 'Includes open and completed sessions (excludes cancelled) — pick a day or month, then use the tabs below'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          {granularity === 'month' ? (
            <div className="min-w-[10rem] flex-1 sm:flex-none">
              <label className="mb-1 block text-xs font-medium text-slate-500">{th ? 'เดือน' : 'Month'}</label>
              <input
                type="month"
                value={dateFrom.slice(0, 7)}
                onChange={(e) => {
                  const r = monthPickerToRange(e.target.value)
                  if (r) {
                    setDateFrom(r.from)
                    setDateTo(r.to)
                  }
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          ) : (
            <ReportDayPicker
              className="min-w-[12rem] flex-1 sm:flex-none"
              value={dateFrom}
              onChange={(d) => {
                setDateFrom(d)
                setDateTo(d)
              }}
              th={th}
            />
          )}

          <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <label className="mb-1 block text-xs font-medium text-slate-500">{th ? 'ฝ่าย' : 'Division'}</label>
            <select
              value={divisionFilter}
              onChange={(e) => {
                setDivisionFilter(e.target.value)
                setSectionFilter('all')
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">{th ? 'ทุกฝ่าย' : 'All divisions'}</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.divisionCode} — {d.divisionName}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <label className="mb-1 block text-xs font-medium text-slate-500">{th ? 'ส่วน' : 'Section'}</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">{th ? 'ทุกส่วน' : 'All sections'}</option>
              {filteredSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sectionCode} — {s.sectionName}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="mb-1 block text-xs font-medium text-slate-500">{th ? 'มุมมอง' : 'View'}</label>
            <div className="inline-flex h-10 w-full rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-sm sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setGranularity('day')
                  setBdView('daily')
                  const d = format(new Date(), 'yyyy-MM-dd')
                  setDateFrom(d)
                  setDateTo(d)
                }}
                className={cn(
                  'flex-1 rounded-lg px-3.5 text-sm font-semibold transition-colors sm:flex-none',
                  bdView === 'daily' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900',
                )}
              >
                {th ? 'รายวัน' : 'Daily'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGranularity('month')
                  setBdView('monthly')
                  const r = monthPickerToRange(dateFrom.slice(0, 7))
                  if (r) {
                    setDateFrom(r.from)
                    setDateTo(r.to)
                  }
                }}
                className={cn(
                  'flex-1 rounded-lg px-3.5 text-sm font-semibold transition-colors sm:flex-none',
                  bdView === 'monthly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900',
                )}
              >
                {th ? 'รายเดือน' : 'Monthly'}
              </button>
              <button
                type="button"
                onClick={() => setBdView('yearly')}
                className={cn(
                  'flex-1 rounded-lg px-3.5 text-sm font-semibold transition-colors sm:flex-none',
                  bdView === 'yearly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900',
                )}
              >
                {th ? 'รายปี' : 'Yearly'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!payload || isLoading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            <Download size={16} />
            Export Excel
          </button>
        </div>
      </div>

      {apiError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{apiError}</div>
      )}

      {allEmpty && !apiError && (
        <div
          role="status"
          className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-medium">
            {th ? 'ไม่พบข้อมูลในช่วงวันที่ที่เลือก' : 'No data for the selected date range'}
          </p>
          <p className="mt-1 text-xs text-amber-800/90">
            {th
              ? 'ตรวจสอบช่วงวันที่ให้ตรงกับ «วันของ Session» (ตามปฏิทินไทยในระบบ) และส่วนที่เลือก — Session ที่ยกเลิกจะไม่ถูกนับ'
              : 'Check the date range matches each session’s calendar date and section filter. Cancelled sessions are excluded.'}
          </p>
        </div>
      )}

      {isValidating && payload && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" aria-hidden />
          {th ? 'กำลังโหลดข้อมูล…' : 'Refreshing…'}
        </p>
      )}

      {showLoadingBlock ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      ) : (
        <Tabs defaultValue="operators" className="w-full">
          <div className="overflow-x-auto pb-1">
            <TabsList className="inline-flex h-auto min-w-full w-max gap-2 rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 text-slate-600 shadow-sm sm:min-w-0 sm:w-full sm:justify-start">
              <TabsTrigger
                value="operators"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                <Users className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                {th ? 'พนักงาน' : 'Operators'}
              </TabsTrigger>
              <TabsTrigger
                value="parts"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                <Package className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                Part
              </TabsTrigger>
              <TabsTrigger
                value="lines"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                <Cog className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {th ? 'ไลน์การผลิต' : 'Lines'}
              </TabsTrigger>
              <TabsTrigger
                value="breakdown"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                <Wrench className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
                {th ? 'วิเคราะห์ Breakdown' : 'Breakdown analysis'}
              </TabsTrigger>
              <TabsTrigger
                value="ng"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
                Defect
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="operators" className="mt-4">
            <ReportSection
              icon={<Users className="text-blue-600" size={20} />}
              title={
                granularity === 'month'
                  ? th
                    ? `พนักงาน — รายเดือน ${operatorMonthMatrix?.monthKey ?? dateFrom.slice(0, 7)}`
                    : `Operators — ${operatorMonthMatrix?.monthKey ?? dateFrom.slice(0, 7)}`
                  : th
                    ? 'พนักงาน — ผลิตรุ่นใด จำนวนเท่าใด (รายวัน)'
                    : 'Operators — part & OK qty (daily)'
              }
              subtitle={
                granularity === 'month'
                  ? th
                    ? 'แต่ละช่อง = เลข Samco และจำนวน OK ที่บันทึกในวันนั้น (หลาย Part ในวันเดียวกันแสดงซ้อนลงมา)'
                    : 'Each cell: Part Samco # and OK qty that day (multiple parts stack).'
                  : undefined
              }
            >
              <div className="mb-3 px-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {th ? 'ค้นหาพนักงาน (ชื่อ / รหัส)' : 'Search operator (name / code)'}
                </label>
                <div className="relative max-w-md">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={operatorSearch}
                    onChange={(e) => setOperatorSearch(e.target.value)}
                    placeholder={th ? 'พิมพ์ชื่อหรือรหัสพนักงาน…' : 'Type name or employee code…'}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
                    autoComplete="off"
                  />
                </div>
              </div>

              {granularity === 'month' && filteredOperatorMatrix ? (
                <OperatorMonthMatrixTable
                  matrix={filteredOperatorMatrix}
                  th={th}
                  emptyMessage={operatorMatrixEmptyMessage}
                />
              ) : (
                <SimpleTable
                  empty={operatorDailyEmptyMessage}
                  cols={[
                    th ? 'พนักงาน' : 'Name',
                    th ? 'รหัส' : 'Code',
                    th ? 'Part' : 'Part',
                    periodLabel,
                    th ? 'OK (ชิ้น)' : 'OK qty',
                  ]}
                  rows={filteredByOperator.map(
                    (r: { name: string; employeeCode: string; partSamco: number; partName: string; period: string; okQty: number }) => [
                      r.name,
                      r.employeeCode,
                      `${r.partSamco} — ${r.partName}`,
                      r.period,
                      r.okQty.toLocaleString(),
                    ],
                  )}
                />
              )}
            </ReportSection>
          </TabsContent>

          <TabsContent value="parts" className="mt-4">
            <ReportSection
              icon={<Package className="text-emerald-600" size={20} />}
              title={th ? 'Part — ผลิตในแต่ละช่วง จำนวนเท่าใด' : 'Parts — OK qty by period'}
            >
              <SimpleTable
                empty={th ? 'ไม่มีข้อมูล Part ในช่วงนี้' : 'No part data'}
                cols={[th ? 'Part (Samco)' : 'Samco', th ? 'ชื่อ' : 'Name', periodLabel, th ? 'OK (ชิ้น)' : 'OK qty']}
                rows={byPart.map((r: { partSamco: number; partName: string; period: string; okQty: number }) => [
                  String(r.partSamco),
                  r.partName,
                  r.period,
                  r.okQty.toLocaleString(),
                ])}
              />
            </ReportSection>
          </TabsContent>

          <TabsContent value="lines" className="mt-4">
            {/* Idle hours summary */}
            <ReportSection
              icon={<Cog className="text-slate-500" size={20} />}
              title={th ? 'ชม. ที่ไม่ได้ใช้งาน — สรุปต่อไลน์' : 'Idle Hours — summary by line'}
              subtitle={
                th
                  ? 'นับเฉพาะวันทำงาน (ไม่รวมอาทิตย์ / วันหยุดนักขัตฤกษ์) และชม.ปกติเท่านั้น (ไม่รวม OT) · ชม.เดินเครื่อง = ชม.บันทึก − ชม.หยุด (BD) · ชม.ว่าง = ชม.แผน − ชม.บันทึก'
                  : 'Working days only (excl. Sundays & public holidays); normal hours only (excl. OT). Running = Recorded − Downtime; Unrecorded = Planned − Recorded.'
              }
            >
              <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
                <table className={DASHBOARD_TABLE_REPORT}>
                  <thead className={DASHBOARD_THEAD_STICKY}>
                    <tr>
                      {(
                        [
                          ['lineCode', th ? 'ไลน์' : 'Line'],
                          ['sessionDays', th ? 'วันที่ขึ้นงาน' : 'Session days'],
                          ['noSessionDays', th ? 'วันไม่ขึ้นงาน' : 'No-session days'],
                          ['sessionDayPct', th ? '% วันที่ขึ้นงาน' : 'Session days %'],
                          ['normalCapacity', th ? 'ชม.แผน (ปกติ)' : 'Planned (hr)'],
                          ['normalHoursUsed', th ? 'ชม.บันทึก' : 'Recorded (hr)'],
                          ['breakdownHours', th ? 'ชม.หยุด (BD)' : 'Downtime (hr)'],
                          ['usedHours', th ? 'ชม.เดินเครื่อง' : 'Running (hr)'],
                          ['inShiftIdleHours', th ? 'ชม.ว่าง (ไม่บันทึก)' : 'Unrecorded (hr)'],
                          ['utilizationPct', th ? '% เดินเครื่อง' : 'Running %'],
                        ] as [keyof ByLineIdleRow, string][]
                      ).map(([key, label]) => (
                        <th key={key} className={DASHBOARD_TH_STICKY_SOFT}>
                          <button
                            type="button"
                            onClick={() => toggleLineIdleSort(key)}
                            className="inline-flex items-center gap-1 rounded hover:bg-slate-200/70 px-1 py-0.5 transition-colors"
                          >
                            <span>{label}</span>
                            {lineIdleSortKey === key ? (
                              lineIdleSortDir === 'asc'
                                ? <ArrowUp size={13} className="text-blue-600 shrink-0" />
                                : <ArrowDown size={13} className="text-blue-600 shrink-0" />
                            ) : (
                              <ArrowUpDown size={13} className="text-slate-400 shrink-0" />
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byLineIdle.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="border border-slate-100 px-3 py-12 text-center text-sm font-medium text-slate-600">
                          {th ? 'ไม่มีข้อมูลไลน์ในช่วงที่เลือก' : 'No line data in selected period'}
                        </td>
                      </tr>
                    ) : (
                      byLineIdle.map((r) => {
                        const pct = r.utilizationPct
                        const sessionPct = r.sessionDayPct
                        const sessionPctColor =
                          sessionPct >= 80 ? 'text-emerald-700 bg-emerald-50' :
                          sessionPct >= 50 ? 'text-amber-700 bg-amber-50' :
                          'text-red-700 bg-red-50'
                        const pctColor =
                          pct >= 80 ? 'text-emerald-700 bg-emerald-50' :
                          pct >= 50 ? 'text-amber-700 bg-amber-50' :
                          'text-red-700 bg-red-50'
                        const td = 'border border-slate-100 px-3 py-2 text-slate-700'
                        return (
                          <tr key={r.lineCode} className="hover:bg-slate-50/80">
                            <td className={td}>{r.lineCode}</td>
                            <td className={td}>{r.sessionDays}</td>
                            <td className={td}>
                              <span className={r.noSessionDays > 0 ? 'font-semibold text-orange-600' : 'text-gray-500'}>
                                {r.noSessionDays}
                              </span>
                            </td>
                            <td className={td}>
                              <span className={`font-bold rounded px-2 py-0.5 ${sessionPctColor}`}>
                                {sessionPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className={td}>{r.normalCapacity.toLocaleString()}</td>
                            <td className={td}>{r.normalHoursUsed.toLocaleString()}</td>
                            <td className={td}>
                              <span className={r.breakdownHours > 0 ? 'font-semibold text-orange-600' : 'text-gray-500'}>
                                {r.breakdownHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className={td}>
                              {r.usedHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </td>
                            <td className={td}>
                              <span className={r.inShiftIdleHours > 0 ? 'font-semibold text-red-600' : 'text-gray-500'}>
                                {r.inShiftIdleHours.toLocaleString()}
                              </span>
                            </td>
                            <td className={td}>
                              <span className={`font-bold rounded px-2 py-0.5 ${pctColor}`}>
                                {pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </ReportSection>

          </TabsContent>

          <TabsContent value="breakdown" className="mt-4">
            <ReportSection
              icon={<Wrench className="text-orange-600" size={20} />}
              title={
                th
                  ? 'Breakdown — เวลาทำงานและเวลาหยุดตามไลน์'
                  : 'Breakdown — working time & downtime by line'
              }
              subtitle={
                bdView === 'daily'
                  ? th
                    ? 'สรุปเวลาทำงาน / เดินเครื่อง / หยุด และสัดส่วนตามหมวด จากรายการ Breakdown ในช่วงที่เลือก (รายวัน)'
                    : 'Working time, machine running, downtime, and category share from Breakdown records in the selected period (daily).'
                  : bdView === 'monthly'
                    ? th
                      ? 'สรุปเวลาทำงาน / เดินเครื่อง / หยุด และสัดส่วนตามหมวด จากรายการ Breakdown ในช่วงที่เลือก (รายเดือน)'
                      : 'Working time, machine running, downtime, and category share from Breakdown records in the selected period (monthly).'
                    : th
                      ? 'Heatmap รายวัน + กราฟแท่งรายเดือน + ตาราง Pivot แยกตามสายการผลิต'
                      : 'Daily heatmap, monthly bar chart, and pivot table by production line.'
              }
            >
              {(bdView === 'daily' || bdView === 'monthly') ? (
                <>
                  <BreakdownSummaryCards rows={byLineBreakdown} th={th} />
                  <BreakdownByLinePivotTable
                    rows={breakdownByLine}
                    categories={breakdownCategories}
                    empty={th ? 'ไม่มีข้อมูล Breakdown ในช่วงนี้' : 'No breakdown data in selected period'}
                    th={th}
                  />
                </>
              ) : (
                <BreakdownYearlyView
                  rows={heatmapRows}
                  year={heatmapYear}
                  setYear={setHeatmapYear}
                  lineFilter={heatmapLineFilter}
                  setLineFilter={setHeatmapLineFilter}
                  availableLines={availableHeatmapLines}
                  isLoading={heatmapLoading}
                  th={th}
                />
              )}
            </ReportSection>
          </TabsContent>

          <TabsContent value="ng" className="mt-4">
            <ReportSection
              icon={<XCircle className="text-red-600" size={20} />}
              title={th ? 'Defect — สรุปตามไลน์การผลิต' : 'Defect — summary by production line'}
              subtitle={
                th
                  ? 'นับจากรายการ Defect ที่บันทึกในช่วงที่เลือก แยกตามไลน์และช่วงเวลา'
                  : 'Defect entries recorded in the selected period, grouped by line.'
              }
            >
              <NgSummaryCards rows={byLineNg} th={th} />
              <NgDefectLineTable rows={byLineNg} periodLabel={periodLabel} th={th} />
            </ReportSection>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

type BdCategoryRow = { categoryId: string; code: string; name: string; count: number; bdMin: number }
type NgCategoryRow = { categoryId: string; code: string; name: string; ngQty: number }
type NgPartRow = { partId: string; partSamco: number; partName: string; ngQty: number; okQty: number }
type BreakdownCategoryMeta = { id: string; code: string; name: string }

type ByLineBreakdownRow = {
  lineId: string
  lineCode: string
  period: string
  bdCount: number
  bdMin: number
  /** Recorded hours (count of hourly records) */
  workHours: number
  /** Planned hours (SUM distinct session.totalHours) */
  plannedHours: number
  topCategory: BdCategoryRow | null
  categories: BdCategoryRow[]
}

type BreakdownLineAgg = {
  lineId: string
  lineCode: string
  workHours: number
  bdMin: number
  catBdMin: Map<string, number>
}

function formatBdHours(hr: number): string {
  return hr.toFixed(2)
}

/** Display-only: strip "Breakdown-" prefix from category codes (e.g. Breakdown-001 → 001) */
function displayBdCategoryCode(code: string): string {
  return code.replace(/^Breakdown-/i, '')
}

function aggregateBreakdownByLine(rows: ByLineBreakdownRow[]): BreakdownLineAgg[] {
  const map = new Map<string, BreakdownLineAgg>()
  for (const r of rows) {
    let agg = map.get(r.lineId)
    if (!agg) {
      agg = {
        lineId: r.lineId,
        lineCode: r.lineCode,
        workHours: 0,
        bdMin: 0,
        catBdMin: new Map(),
      }
      map.set(r.lineId, agg)
    }
    agg.workHours += Number(r.workHours) || 0
    agg.bdMin += Number(r.bdMin) || 0
    for (const cat of r.categories ?? []) {
      const id = cat.categoryId
      agg.catBdMin.set(id, (agg.catBdMin.get(id) ?? 0) + (Number(cat.bdMin) || 0))
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true, sensitivity: 'base' }),
  )
}

/** Downtime % severity: &lt;5% green, 5–&lt;10% amber, ≥10% red */
function downPctBgClass(pct: number | null): string {
  if (pct == null) return ''
  if (pct < 5) return 'bg-emerald-50'
  if (pct < 10) return 'bg-amber-100'
  return 'bg-red-100'
}

function BreakdownByLinePivotTable({
  rows,
  categories,
  empty,
  th,
}: {
  rows: BreakdownLineAgg[]
  categories: BreakdownCategoryMeta[]
  empty: string
  th: boolean
}) {
  const [downPctSortDir, setDownPctSortDir] = useState<'asc' | 'desc'>('desc')
  const metricColCount = 5
  const catCount = categories.length
  const totalCols = metricColCount + catCount

  const sortedRows = useMemo(() => {
    const withPct = rows.map((r) => {
      const workHr = r.workHours
      const downHr = r.bdMin / 60
      const runningHr = Math.max(0, workHr - downHr)
      const downPct = workHr > 0 ? (downHr / workHr) * 100 : null
      return { ...r, workHr, downHr, runningHr, downPct }
    })
    const dir = downPctSortDir === 'asc' ? 1 : -1
    return withPct.sort((a, b) => {
      if (a.downPct == null && b.downPct == null) {
        return a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true })
      }
      if (a.downPct == null) return 1
      if (b.downPct == null) return -1
      const c = dir * (a.downPct - b.downPct)
      if (c !== 0) return c
      return a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true })
    })
  }, [rows, downPctSortDir])

  const toggleDownPctSort = () => {
    setDownPctSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  if (rows.length === 0) {
    return (
      <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
        <table className={DASHBOARD_TABLE_REPORT}>
          <tbody>
            <tr>
              <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={Math.max(totalCols, 1)}>
                {empty}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const labelRowSpan = catCount > 0 ? 2 : 1

  return (
    <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
      <table className={DASHBOARD_TABLE_REPORT}>
        <thead className={DASHBOARD_THEAD_STICKY}>
          <tr>
            <th className={DASHBOARD_TH_STICKY_SOFT} rowSpan={labelRowSpan}>
              {th ? 'ไลน์' : 'Line'}
            </th>
            <th className={DASHBOARD_TH_STICKY_SOFT} rowSpan={labelRowSpan}>
              {th ? 'เวลาทำงาน (บันทึก)' : 'Working (recorded)'}
            </th>
            <th className={DASHBOARD_TH_STICKY_SOFT} rowSpan={labelRowSpan}>
              {th ? 'เวลาเดินเครื่องจักร' : 'Machine running'}
            </th>
            <th className={DASHBOARD_TH_STICKY_SOFT} rowSpan={labelRowSpan}>
              {th ? 'เวลาหยุดรวม' : 'Total downtime'}
            </th>
            <th className={DASHBOARD_TH_STICKY_SOFT} rowSpan={labelRowSpan}>
              <button
                type="button"
                onClick={toggleDownPctSort}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-200/70"
              >
                <span>{th ? 'เวลาหยุดรวม %' : 'Downtime %'}</span>
                {downPctSortDir === 'asc' ? (
                  <ArrowUp size={13} className="shrink-0 text-blue-600" />
                ) : (
                  <ArrowDown size={13} className="shrink-0 text-blue-600" />
                )}
              </button>
            </th>
            {catCount > 0 ? (
              <th
                className={cn(DASHBOARD_TH_STICKY_SOFT, 'text-center')}
                colSpan={catCount}
              >
                {th ? 'สรุปตามหมวดหมู่ ประเภท BREAKDOWN' : 'Breakdown category summary'}
              </th>
            ) : null}
          </tr>
          {catCount > 0 ? (
            <tr>
              {categories.map((c) => (
                <th
                  key={c.id}
                  className={DASHBOARD_TH_STICKY_SOFT}
                  title={`${c.code} — ${c.name}`}
                >
                  {displayBdCategoryCode(c.code)}
                </th>
              ))}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr key={r.lineId}>
              <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-slate-800">
                {r.lineCode}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-slate-700">
                {formatBdHours(r.workHr)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-slate-700">
                {formatBdHours(r.runningHr)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-slate-700">
                {formatBdHours(r.downHr)}
              </td>
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-right text-sm font-medium text-black',
                  downPctBgClass(r.downPct),
                )}
              >
                {r.downPct != null ? `${r.downPct.toFixed(2)}%` : '—'}
              </td>
              {categories.map((c) => {
                const catHr = (r.catBdMin.get(c.id) ?? 0) / 60
                return (
                  <td
                    key={c.id}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-right text-sm text-slate-700',
                      catHr > 0 && 'bg-red-50',
                    )}
                  >
                    {formatBdHours(catHr)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type ByLineNgRow = {
  lineId: string
  lineCode: string
  period: string
  ngQty: number
  okQty: number
  ngRate: number
  topCategory: NgCategoryRow | null
  categories: NgCategoryRow[]
  defectivePartCount: number
  topPart: NgPartRow | null
  parts: NgPartRow[]
}

function formatTopPartPlain(p: NgPartRow | null | undefined): string {
  if (!p) return ''
  return `${p.partSamco} — ${p.partName} (${p.ngQty})`
}

function formatTopPartDisplay(p: NgPartRow | null | undefined): string {
  if (!p) return '—'
  return `${p.partSamco} — ${p.partName} (${p.ngQty.toLocaleString()})`
}

type ByLineIdleRow = {
  lineId: string
  lineCode: string
  totalWorkingDays: number
  sessionDays: number
  noSessionDays: number
  sessionDayPct: number
  normalCapacity: number
  normalHoursUsed: number
  breakdownHours: number
  usedHours: number
  inShiftIdleHours: number
  utilizationPct: number
}

function BreakdownSummaryCards({ rows, th }: { rows: ByLineBreakdownRow[]; th: boolean }) {
  const totalCount = rows.reduce((s, r) => s + r.bdCount, 0)
  const totalMin = rows.reduce((s, r) => s + r.bdMin, 0)
  const plannedHr = rows.reduce((s, r) => s + (Number(r.plannedHours) || 0), 0)
  const workHr = rows.reduce((s, r) => s + (Number(r.workHours) || 0), 0)
  const downHr = totalMin / 60
  const runningHr = Math.max(0, workHr - downHr)
  const avgHr = totalCount > 0 ? downHr / totalCount : 0
  const recordedVsPlannedPct = plannedHr > 0 ? (workHr / plannedHr) * 100 : null
  const runningPct = workHr > 0 ? (runningHr / workHr) * 100 : null
  const downPct = workHr > 0 ? (downHr / workHr) * 100 : null
  const hrUnit = th ? 'ชม.' : 'hr'
  if (rows.length === 0) return null

  // Aggregate categories across all line×period rows
  const catMap = new Map<string, { categoryId: string; code: string; name: string; count: number; bdMin: number }>()
  for (const row of rows) {
    for (const cat of row.categories) {
      const existing = catMap.get(cat.categoryId)
      if (existing) {
        existing.count += cat.count
        existing.bdMin += cat.bdMin
      } else {
        catMap.set(cat.categoryId, { ...cat })
      }
    }
  }
  const rankedCats = Array.from(catMap.values()).sort((a, b) => b.bdMin - a.bdMin)
  const pieData = rankedCats
    .filter((c) => c.bdMin > 0)
    .map((c) => ({
      key: c.categoryId,
      name: displayBdCategoryCode(c.code),
      catName: c.name,
      fullName: `${c.code} — ${c.name}`,
      value: c.bdMin,
      hours: c.bdMin / 60,
      count: c.count,
      ratePct: totalMin > 0 ? (c.bdMin / totalMin) * 100 : 0,
    }))

  const kpiCards = (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'เวลาทำงาน (บันทึก)' : 'Working (recorded)'}</p>
        <p className="text-2xl font-bold text-orange-700">
          {formatBdHours(workHr)} {hrUnit}
        </p>
        <p className="mt-0.5 text-xs font-medium text-black">
          {recordedVsPlannedPct != null ? `${recordedVsPlannedPct.toFixed(2)}%` : '—'}
        </p>
      </div>
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'เวลาเดินเครื่องจักร' : 'Machine running'}</p>
        <p className="text-2xl font-bold text-orange-700">
          {formatBdHours(runningHr)} {hrUnit}
        </p>
        <p className="mt-0.5 text-xs font-medium text-black">
          {runningPct != null ? `${runningPct.toFixed(2)}%` : '—'}
        </p>
      </div>
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'เวลาหยุดรวม' : 'Total Downtime'}</p>
        <p className="text-2xl font-bold text-orange-700">
          {formatBdHours(downHr)} {hrUnit}
        </p>
        <p className="mt-0.5 text-xs font-medium text-black">
          {downPct != null ? `${downPct.toFixed(2)}%` : '—'}
        </p>
      </div>
      <div
        className="hidden w-px self-stretch bg-orange-200 sm:block"
        aria-hidden
      />
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'เวลาทำงาน (แผน)' : 'Working (planned)'}</p>
        <p className="text-2xl font-bold text-orange-700">
          {formatBdHours(plannedHr)} {hrUnit}
        </p>
      </div>
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'จำนวนครั้ง' : 'Total Events'}</p>
        <p className="text-2xl font-bold text-orange-700">{totalCount.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-orange-700">{th ? 'เฉลี่ย/ครั้ง' : 'Avg/Event'}</p>
        <p className="text-2xl font-bold text-orange-700">
          {totalCount > 0 ? `${formatBdHours(avgHr)} ${hrUnit}` : '—'}
        </p>
      </div>
    </div>
  )

  return (
    <div className="mb-4 px-2">
      {/* ซ้าย: donut+legend | ขวา: KPI + ตารางรายหมวด */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {pieData.length > 0 && (
          <aside className="w-full shrink-0 rounded-xl border border-orange-100 bg-white p-4 xl:w-[340px] xl:sticky xl:top-2">
            <p className="mb-3 text-sm font-semibold text-orange-700">
              {th ? 'สัดส่วนเวลาหยุดตามหมวด (Rate %)' : 'Downtime share by category (Rate %)'}
            </p>
            <div className="relative mx-auto h-[200px] w-full max-w-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="88%"
                    paddingAngle={pieData.length > 1 ? 1.5 : 0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={entry.key}
                        fill={BD_DONUT_COLORS[i % BD_DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, _name: string, item: { payload?: { ratePct?: number; fullName?: string } }) => {
                      const rate = item?.payload?.ratePct
                      const label = item?.payload?.fullName ?? ''
                      const hr = (Number(value) || 0) / 60
                      return [
                        `${formatBdHours(hr)} ${th ? 'ชม.' : 'hr'}${rate != null ? ` (${rate.toFixed(2)}%)` : ''}`,
                        label,
                      ]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold tabular-nums text-orange-700">
                  {formatBdHours(downHr)}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  {th ? 'ชม.' : 'hr'}
                </p>
              </div>
            </div>
            <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {pieData.map((entry, i) => (
                <li
                  key={entry.key}
                  className="flex items-center gap-2 rounded-md px-1 py-1"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: BD_DONUT_COLORS[i % BD_DONUT_COLORS.length] }}
                    aria-hidden
                  />
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    <span className="font-mono text-orange-700">{entry.name}</span>
                    <span className="ml-1 text-slate-600">{entry.catName}</span>
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-orange-700">
                    {entry.ratePct.toFixed(2)}%
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          {kpiCards}
          {rankedCats.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {th ? 'สรุปรายละเอียดรายหมวด' : 'Category detail'}
              </p>
              <div className="overflow-x-auto rounded-lg border border-orange-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-orange-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-orange-700">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-orange-700">
                        {th ? 'หมวดหมู่' : 'Category'}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">
                        {th ? 'ครั้ง' : 'Events'}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">
                        {th ? 'เวลารวม (ชม.)' : 'Total (hr)'}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">
                        {th ? 'เฉลี่ย/ครั้ง (ชม.)' : 'Avg/event (hr)'}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">
                        Rate %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedCats.map((cat, i) => {
                      const catHr = cat.bdMin / 60
                      const avgCatHr = cat.count > 0 ? catHr / cat.count : 0
                      const ratePct = totalMin > 0 ? (cat.bdMin / totalMin) * 100 : null
                      return (
                        <tr key={cat.categoryId} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50/40'}>
                          <td className="px-3 py-2 text-xs font-medium text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 text-slate-800">
                            <span className="mr-1.5 font-mono text-xs text-orange-600">{cat.code}</span>
                            {cat.name}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {cat.count.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {formatBdHours(catHr)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {cat.count > 0 ? formatBdHours(avgCatHr) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">
                            {ratePct != null ? `${ratePct.toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NgSummaryCards({ rows, th }: { rows: ByLineNgRow[]; th: boolean }) {
  const totalNg = rows.reduce((s, r) => s + r.ngQty, 0)
  const totalOk = rows.reduce((s, r) => s + r.okQty, 0)
  const overallRate = totalNg + totalOk > 0 ? totalNg / (totalNg + totalOk) : 0
  if (rows.length === 0) return null

  // Aggregate categories across all line×period rows
  const catMap = new Map<string, { categoryId: string; code: string; name: string; ngQty: number }>()
  for (const row of rows) {
    for (const cat of row.categories) {
      const existing = catMap.get(cat.categoryId)
      if (existing) {
        existing.ngQty += cat.ngQty
      } else {
        catMap.set(cat.categoryId, { ...cat })
      }
    }
  }
  const rankedCats = Array.from(catMap.values()).sort((a, b) => b.ngQty - a.ngQty)

  return (
    <div className="mb-4 space-y-4 px-2">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-center">
          <p className="text-xs text-red-600">{th ? 'Defect รวม (ชิ้น)' : 'Total Defect qty'}</p>
          <p className="text-2xl font-bold text-red-700">{totalNg.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-center">
          <p className="text-xs text-red-600">{th ? 'Defect Rate รวม' : 'Overall Defect Rate'}</p>
          <p className={`text-2xl font-bold ${overallRate >= 0.05 ? 'text-red-700' : overallRate >= 0.02 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {(overallRate * 100).toFixed(2)}%
          </p>
        </div>
      </div>
      {rankedCats.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {th ? 'สรุปตามหมวดหมู่' : 'Category Summary'}
          </p>
          <div className="overflow-x-auto rounded-lg border border-red-100">
            <table className="min-w-full text-sm">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">
                    {th ? 'หมวดหมู่' : 'Category'}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-red-700">
                    {th ? 'Defect (ชิ้น)' : 'Defect qty'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankedCats.map((cat, i) => (
                  <tr key={cat.categoryId} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}>
                    <td className="px-3 py-2 text-xs font-medium text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 text-slate-800">
                      <span className="mr-1.5 font-mono text-xs text-red-600">{cat.code}</span>
                      {cat.name}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {cat.ngQty.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function NgPartDetailMiniTable({ parts, th }: { parts: NgPartRow[]; th: boolean }) {
  if (parts.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-lg border border-red-100 bg-red-50/30">
      <table className="min-w-full text-sm">
        <thead className="bg-red-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Samco</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Part</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-red-700">
              {th ? 'Defect (ชิ้น)' : 'Defect qty'}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-red-700">
              {th ? 'OK (ชิ้น)' : 'OK qty'}
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p, i) => (
            <tr key={p.partId} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}>
              <td className="px-3 py-2 text-xs font-medium text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-red-600">{p.partSamco}</td>
              <td className="px-3 py-2 text-slate-800">{p.partName}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-700">{p.ngQty.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-700">{(p.okQty ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NgDefectLineTable({
  rows,
  periodLabel,
  th,
}: {
  rows: ByLineNgRow[]
  periodLabel: string
  th: boolean
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [ngRateSortDir, setNgRateSortDir] = useState<'asc' | 'desc'>('desc')
  const colCount = 8

  const sortedRows = useMemo(() => {
    const dir = ngRateSortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => dir * (a.ngRate - b.ngRate))
  }, [rows, ngRateSortDir])

  const toggleNgRateSort = () => {
    setNgRateSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  return (
    <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
      <table className={DASHBOARD_TABLE_REPORT}>
        <thead className={DASHBOARD_THEAD_STICKY}>
          <tr>
            <th className={DASHBOARD_TH_STICKY_SOFT} />
            <th className={DASHBOARD_TH_STICKY_SOFT}>{th ? 'ไลน์' : 'Line'}</th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>{periodLabel}</th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>{th ? 'Defect (ชิ้น)' : 'Defect qty'}</th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>{th ? 'OK (ชิ้น)' : 'OK qty'}</th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>
              <button
                type="button"
                onClick={toggleNgRateSort}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-200/70"
              >
                <span>Defect Rate%</span>
                {ngRateSortDir === 'asc' ? (
                  <ArrowUp size={13} className="shrink-0 text-blue-600" />
                ) : (
                  <ArrowDown size={13} className="shrink-0 text-blue-600" />
                )}
              </button>
            </th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>{th ? 'จำนวน Part' : '# Parts'}</th>
            <th className={DASHBOARD_TH_STICKY_SOFT}>{th ? 'Part หลัก' : 'Top Part'}</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="border border-slate-100 px-3 py-12 text-center text-sm font-medium text-slate-600"
              >
                {th ? 'ไม่มีข้อมูล Defect ในช่วงนี้' : 'No Defect data in selected period'}
              </td>
            </tr>
          ) : (
            sortedRows.map((r) => {
              const rowKey = `${r.lineId}|${r.period}`
              const isExpanded = expandedKey === rowKey
              const parts = r.parts ?? []
              const canExpand = parts.length > 0
              return (
                <Fragment key={rowKey}>
                  <tr className="hover:bg-slate-50/80">
                    <td className="border border-slate-100 px-2 py-2 text-center">
                      {canExpand ? (
                        <button
                          type="button"
                          onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                          className="inline-flex rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={isExpanded ? (th ? 'ย่อรายละเอียด' : 'Collapse') : (th ? 'ขยายรายละเอียด Part' : 'Expand parts')}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : (
                        <span className="inline-block w-6" />
                      )}
                    </td>
                    <td className="border border-slate-100 px-3 py-2 text-slate-700">{r.lineCode}</td>
                    <td className="border border-slate-100 px-3 py-2 text-slate-700">{r.period}</td>
                    <td className="border border-slate-100 px-3 py-2 text-slate-700">{r.ngQty.toLocaleString()}</td>
                    <td className="border border-slate-100 px-3 py-2 text-slate-700">{r.okQty.toLocaleString()}</td>
                    <td className="border border-slate-100 px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${r.ngRate >= 0.05 ? 'bg-red-100 text-red-700' : r.ngRate >= 0.02 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {(r.ngRate * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="border border-slate-100 px-3 py-2 text-center font-semibold text-slate-700">
                      {r.defectivePartCount ?? parts.length}
                    </td>
                    <td className="border border-slate-100 px-3 py-2 text-slate-700">
                      {formatTopPartDisplay(r.topPart)}
                    </td>
                  </tr>
                  {isExpanded && canExpand && (
                    <tr>
                      <td colSpan={colCount} className="border border-slate-100 bg-slate-50/50 px-4 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {th ? 'รายละเอียด Defect ตาม Part' : 'Defect by part'}
                        </p>
                        <NgPartDetailMiniTable parts={parts} th={th} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

const BD_YEARLY_MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const BD_YEARLY_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type YearlyMonthEntry = {
  monthKey: string
  monthNum: number
  label: string
  bdCount: number
  bdMin: number
  topCatLabel: string
}

type YearlyViewProps = {
  rows: ByLineBreakdownRow[]
  year: number
  setYear: (y: number) => void
  lineFilter: string
  setLineFilter: (l: string) => void
  availableLines: string[]
  isLoading: boolean
  th: boolean
}

function BreakdownMonthlyList({ rows, year, setYear, lineFilter, setLineFilter, availableLines, isLoading, th }: YearlyViewProps) {
  const [metric, setMetric] = useState<'count' | 'min'>('min')
  const MONTHS = th ? BD_YEARLY_MONTHS_TH : BD_YEARLY_MONTHS_EN
  const thisYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: thisYear - 2019 }, (_, i) => thisYear - i)

  type LineMonthEntry = {
    lineCode: string
    monthIdx: number
    bdCount: number
    bdMin: number
    topCatLabel: string
  }

  const tableRows = useMemo((): LineMonthEntry[] => {
    type Agg = { bdCount: number; bdMin: number; catMap: Map<string, { code: string; name: string; bdMin: number }> }
    const map = new Map<string, Agg>()

    for (const row of rows) {
      if (lineFilter !== 'all' && row.lineCode !== lineFilter) continue
      const mi = parseInt(row.period.slice(5, 7)) - 1
      const key = `${row.lineCode}::${mi}`
      if (!map.has(key)) map.set(key, { bdCount: 0, bdMin: 0, catMap: new Map() })
      const m = map.get(key)!
      m.bdCount += row.bdCount
      m.bdMin += row.bdMin
      for (const cat of row.categories) {
        const ex = m.catMap.get(cat.categoryId)
        if (ex) ex.bdMin += cat.bdMin
        else m.catMap.set(cat.categoryId, { code: cat.code, name: cat.name, bdMin: cat.bdMin })
      }
    }

    const lines = Array.from(new Set(rows.filter(r => lineFilter === 'all' || r.lineCode === lineFilter).map(r => r.lineCode))).sort()
    const result: LineMonthEntry[] = []
    for (const lineCode of lines) {
      for (let mi = 0; mi < 12; mi++) {
        const key = `${lineCode}::${mi}`
        const agg = map.get(key)
        const topCat = agg ? Array.from(agg.catMap.values()).sort((a, b) => b.bdMin - a.bdMin)[0] ?? null : null
        result.push({
          lineCode,
          monthIdx: mi,
          bdCount: agg?.bdCount ?? 0,
          bdMin: agg?.bdMin ?? 0,
          topCatLabel: topCat ? `${topCat.code} — ${topCat.name}` : '',
        })
      }
    }
    return result
  }, [rows, lineFilter])

  const totalCount = tableRows.reduce((s, r) => s + r.bdCount, 0)
  const totalMin = tableRows.reduce((s, r) => s + r.bdMin, 0)
  const maxVal = Math.max(...tableRows.map(r => metric === 'count' ? r.bdCount : r.bdMin), 0)

  return (
    <div className="space-y-4 p-2">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'ปี' : 'Year'}</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'ไลน์' : 'Line'}</label>
          <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400">
            <option value="all">{th ? 'ทุกไลน์' : 'All lines'}</option>
            {availableLines.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'แสดงผล' : 'Metric'}</label>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(['min', 'count'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMetric(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${metric === m ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {m === 'min' ? (th ? 'เวลารวม (นาที)' : 'Downtime (min)') : (th ? 'จำนวนครั้ง' : 'Events')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : totalCount === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {th ? 'ไม่มีข้อมูล Breakdown ในปีนี้' : 'No breakdown data this year'}
        </p>
      ) : (
        <>
          {/* Summary chips */}
          <div className="flex gap-4">
            <div className="rounded-xl border border-slate-100 bg-white px-5 py-3">
              <p className="text-xs text-slate-500">{th ? 'รวมทั้งปี (ครั้ง)' : 'Total events'}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-800">{totalCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-5 py-3">
              <p className="text-xs text-slate-500">{th ? 'เวลาหยุดรวม (นาที)' : 'Total downtime (min)'}</p>
              <p className="mt-0.5 text-2xl font-bold text-orange-600">{totalMin.toLocaleString()}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{th ? 'ไลน์' : 'Line'}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{th ? 'เดือน' : 'Month'}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">{th ? 'ครั้ง' : 'Events'}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">{th ? 'เวลารวม (นาที)' : 'Downtime (min)'}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">{th ? 'เฉลี่ย/ครั้ง' : 'Avg/event'}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{th ? 'หมวดหมู่หลัก' : 'Top Category'}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, idx) => {
                  const val = metric === 'count' ? r.bdCount : r.bdMin
                  const isMax = val === maxVal && val > 0
                  const isEmpty = r.bdCount === 0
                  const prevLine = idx > 0 ? tableRows[idx - 1].lineCode : null
                  const isLineStart = r.lineCode !== prevLine
                  return (
                    <tr key={`${r.lineCode}-${r.monthIdx}`}
                      className={isMax ? 'bg-orange-50' : isEmpty ? 'opacity-30' : 'hover:bg-slate-50/70'}>
                      <td className={`sticky left-0 bg-inherit px-4 py-1.5 font-medium text-slate-700 ${isLineStart ? 'pt-3' : ''}`}>
                        {isLineStart ? r.lineCode : ''}
                      </td>
                      <td className="px-4 py-1.5 text-slate-500">{MONTHS[r.monthIdx]}</td>
                      <td className="px-4 py-1.5 text-right text-slate-700">{r.bdCount > 0 ? r.bdCount.toLocaleString() : '—'}</td>
                      <td className="px-4 py-1.5 text-right font-semibold text-orange-700">{r.bdMin > 0 ? r.bdMin.toLocaleString() : '—'}</td>
                      <td className="px-4 py-1.5 text-right text-slate-500">{r.bdCount > 0 ? Math.round(r.bdMin / r.bdCount).toLocaleString() : '—'}</td>
                      <td className="px-4 py-1.5 text-slate-400 text-xs">{r.topCatLabel || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-slate-700">{th ? 'รวมทั้งปี' : 'Total'}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-700">{totalCount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-orange-700">{totalMin.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-500">
                    {totalCount > 0 ? Math.round(totalMin / totalCount).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function BreakdownYearlyView({ rows, year, setYear, lineFilter, setLineFilter, availableLines, isLoading, th }: YearlyViewProps) {
  const [metric, setMetric] = useState<'count' | 'min'>('min')
  const MONTHS = th ? BD_YEARLY_MONTHS_TH : BD_YEARLY_MONTHS_EN

  const monthly = useMemo((): YearlyMonthEntry[] => {
    type MonthAgg = {
      bdCount: number
      bdMin: number
      catMap: Map<string, { code: string; name: string; count: number; bdMin: number }>
    }
    const map = new Map<string, MonthAgg>()
    for (const row of rows) {
      if (lineFilter !== 'all' && row.lineCode !== lineFilter) continue
      const mk = row.period.slice(0, 7)
      if (!map.has(mk)) map.set(mk, { bdCount: 0, bdMin: 0, catMap: new Map() })
      const m = map.get(mk)!
      m.bdCount += row.bdCount
      m.bdMin += row.bdMin
      for (const cat of row.categories) {
        const ex = m.catMap.get(cat.categoryId)
        if (ex) { ex.count += cat.count; ex.bdMin += cat.bdMin }
        else m.catMap.set(cat.categoryId, { code: cat.code, name: cat.name, count: cat.count, bdMin: cat.bdMin })
      }
    }
    return Array.from({ length: 12 }, (_, i) => {
      const mk = `${year}-${String(i + 1).padStart(2, '0')}`
      const agg = map.get(mk)
      const topCat = agg
        ? Array.from(agg.catMap.values()).sort((a, b) => b.bdMin - a.bdMin)[0] ?? null
        : null
      return {
        monthKey: mk,
        monthNum: i + 1,
        label: MONTHS[i],
        bdCount: agg?.bdCount ?? 0,
        bdMin: agg?.bdMin ?? 0,
        topCatLabel: topCat ? `${topCat.code} — ${topCat.name}` : '',
      }
    })
  }, [rows, lineFilter, year, MONTHS])

  const totalCount = monthly.reduce((s, m) => s + m.bdCount, 0)
  const totalMin = monthly.reduce((s, m) => s + m.bdMin, 0)

  const thisYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: thisYear - 2019 }, (_, i) => thisYear - i)

  // Pivot: lines × months
  const pivot = useMemo(() => {
    type LineAgg = { bdCount: number[]; bdMin: number[] }
    const lineMap = new Map<string, LineAgg>()

    for (const row of rows) {
      if (lineFilter !== 'all' && row.lineCode !== lineFilter) continue
      const mi = parseInt(row.period.slice(5, 7)) - 1
      if (!lineMap.has(row.lineCode)) {
        lineMap.set(row.lineCode, { bdCount: Array(12).fill(0), bdMin: Array(12).fill(0) })
      }
      const la = lineMap.get(row.lineCode)!
      la.bdCount[mi] += row.bdCount
      la.bdMin[mi] += row.bdMin
    }

    const lineRows = Array.from(lineMap.entries())
      .map(([lineCode, la]) => ({
        lineCode,
        values: metric === 'count' ? la.bdCount : la.bdMin,
        total: (metric === 'count' ? la.bdCount : la.bdMin).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.lineCode.localeCompare(b.lineCode, 'th', { numeric: true }))

    const colTotals = Array.from({ length: 12 }, (_, mi) =>
      lineRows.reduce((s, r) => s + r.values[mi], 0)
    )
    const grandTotal = colTotals.reduce((s, v) => s + v, 0)
    const maxCell = Math.max(...lineRows.flatMap(r => r.values), 0)

    return { lineRows, colTotals, grandTotal, maxCell }
  }, [rows, lineFilter, metric])

  const dataKey = metric === 'count' ? 'bdCount' : 'bdMin'
  const yLabel = metric === 'count'
    ? (th ? 'ครั้ง' : 'Events')
    : (th ? 'นาที' : 'Min')

  function customTooltip({ active, payload }: { active?: boolean; payload?: { payload: YearlyMonthEntry }[] }) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
        <p className="mb-1 font-semibold text-slate-700">{d.label} {year}</p>
        <p className="text-orange-600">
          {d.bdCount.toLocaleString()} {th ? 'ครั้ง' : 'events'}
          {' · '}
          {d.bdMin.toLocaleString()} {th ? 'นาที' : 'min'}
        </p>
        {d.bdCount > 0 && (
          <p className="text-slate-500">
            {th ? 'เฉลี่ย' : 'Avg'}: {Math.round(d.bdMin / d.bdCount).toLocaleString()} {th ? 'นาที/ครั้ง' : 'min/event'}
          </p>
        )}
        {d.topCatLabel && (
          <p className="mt-0.5 text-slate-400">{th ? 'หมวด' : 'Category'}: {d.topCatLabel}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-2">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'ปี' : 'Year'}</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'ไลน์' : 'Line'}</label>
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">{th ? 'ทุกไลน์' : 'All lines'}</option>
            {availableLines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'แสดงผล' : 'Metric'}</label>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setMetric('min')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                metric === 'min' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {th ? 'เวลารวม (นาที)' : 'Downtime (min)'}
            </button>
            <button
              type="button"
              onClick={() => setMetric('count')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                metric === 'count' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {th ? 'จำนวนครั้ง' : 'Events'}
            </button>
          </div>
        </div>
      </div>

      {/* Heatmap + Bar chart — side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Heatmap */}
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {th ? 'Heatmap รายวัน' : 'Daily Heatmap'}
          </p>
          <BreakdownHeatmap
            rows={rows}
            year={year}
            setYear={setYear}
            lineFilter={lineFilter}
            setLineFilter={setLineFilter}
            metric={metric}
            setMetric={setMetric}
            availableLines={availableLines}
            isLoading={isLoading}
            th={th}
            hideControls
          />
        </div>

        {/* Bar chart */}
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {th ? 'สรุปรายเดือน' : 'Monthly Summary'}
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : totalCount === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {th ? 'ไม่มีข้อมูล Breakdown ในปีนี้' : 'No breakdown data this year'}
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  />
                  <RechartsTooltip
                    content={({ active, payload }) =>
                      customTooltip({
                        active: active as boolean | undefined,
                        payload: payload as { payload: YearlyMonthEntry }[] | undefined,
                      })
                    }
                    cursor={{ fill: '#fef3c7', opacity: 0.5 }}
                  />
                  <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {monthly.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry[dataKey] > 0 ? '#f97316' : '#e2e8f0'}
                        fillOpacity={entry[dataKey] > 0 ? 1 : 0.75}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-center text-xs text-slate-400">{yLabel}</p>
            </>
          )}
        </div>
      </div>

      {/* Pivot table: lines × months */}
      {!isLoading && (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-500 min-w-[100px]">
                    {th ? 'สายการผลิต' : 'Line'}
                  </th>
                  {MONTHS.map((m, i) => (
                    <th key={i} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 min-w-[52px]">
                      {m}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-orange-600 min-w-[60px]">
                    {th ? 'รวม' : 'Total'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivot.lineRows.map((lr) => (
                  <tr key={lr.lineCode} className="hover:bg-slate-50/70">
                    <td className="sticky left-0 bg-inherit px-4 py-2 font-medium text-slate-700">{lr.lineCode}</td>
                    {lr.values.map((v, mi) => {
                      const isMax = v === pivot.maxCell && v > 0
                      return (
                        <td key={mi}
                          className={`px-3 py-2 text-center text-xs ${
                            isMax ? 'font-bold text-orange-700 bg-orange-50' : v > 0 ? 'text-slate-700' : 'text-slate-300'
                          }`}>
                          {v > 0 ? v.toLocaleString() : '—'}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2 text-right text-xs font-semibold text-orange-700">
                      {lr.total > 0 ? lr.total.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {pivot.lineRows.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td className="sticky left-0 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700">
                      {th ? 'รวมทุกไลน์' : 'All lines'}
                    </td>
                    {pivot.colTotals.map((v, mi) => (
                      <td key={mi} className={`px-3 py-2.5 text-center text-xs font-bold ${v > 0 ? 'text-orange-700' : 'text-slate-300'}`}>
                        {v > 0 ? v.toLocaleString() : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-orange-700">
                      {pivot.grandTotal > 0 ? pivot.grandTotal.toLocaleString() : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
      )}
    </div>
  )
}

const BD_HEATMAP_MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const BD_HEATMAP_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BD_HEATMAP_DAYS_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const BD_HEATMAP_DAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function BreakdownHeatmap({
  rows,
  year,
  setYear,
  lineFilter,
  setLineFilter,
  metric,
  setMetric,
  availableLines,
  isLoading,
  th,
  hideControls = false,
}: {
  rows: ByLineBreakdownRow[]
  year: number
  setYear: (y: number) => void
  lineFilter: string
  setLineFilter: (l: string) => void
  metric: 'count' | 'min'
  setMetric: (m: 'count' | 'min') => void
  availableLines: string[]
  isLoading: boolean
  th: boolean
  hideControls?: boolean
}) {
  const MONTHS = th ? BD_HEATMAP_MONTHS_TH : BD_HEATMAP_MONTHS_EN
  const DAY_LABELS = th ? BD_HEATMAP_DAYS_TH : BD_HEATMAP_DAYS_EN

  // Floating tooltip state — tracks hovered cell + cursor position (fixed coords)
  const [tooltip, setTooltip] = useState<{ date: string; x: number; y: number } | null>(null)

  // Aggregate rows → per-day totals
  const dayMap = useMemo(() => {
    const map = new Map<string, { bdCount: number; bdMin: number; topCat: string }>()
    for (const row of rows) {
      if (lineFilter !== 'all' && row.lineCode !== lineFilter) continue
      const existing = map.get(row.period)
      if (existing) {
        existing.bdCount += row.bdCount
        existing.bdMin += row.bdMin
        if (!existing.topCat && row.topCategory) existing.topCat = row.topCategory.name
      } else {
        map.set(row.period, {
          bdCount: row.bdCount,
          bdMin: row.bdMin,
          topCat: row.topCategory?.name ?? '',
        })
      }
    }
    return map
  }, [rows, lineFilter])

  const maxValue = useMemo(() => {
    let max = 0
    for (const v of dayMap.values()) {
      const val = metric === 'count' ? v.bdCount : v.bdMin
      if (val > max) max = val
    }
    return max
  }, [dayMap, metric])

  // Build 52–53 week grid + month label spans for the given year
  const { weeks, monthSpans } = useMemo(() => {
    const jan1 = new Date(Date.UTC(year, 0, 1))
    const jan1Dow = (jan1.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
    const nextJan1 = new Date(Date.UTC(year + 1, 0, 1))
    const daysInYear = (nextJan1.getTime() - jan1.getTime()) / 86400000
    const totalWeeks = Math.ceil((jan1Dow + daysInYear) / 7)

    const weeksArr: (string | null)[][] = []
    for (let w = 0; w < totalWeeks; w++) {
      const week: (string | null)[] = []
      for (let d = 0; d < 7; d++) {
        const dayIndex = w * 7 + d - jan1Dow
        if (dayIndex < 0 || dayIndex >= daysInYear) {
          week.push(null)
        } else {
          week.push(new Date(Date.UTC(year, 0, 1 + dayIndex)).toISOString().slice(0, 10))
        }
      }
      weeksArr.push(week)
    }

    // Month label spans — partition week columns without overlap
    const monthStartWeeks: number[] = []
    for (let m = 0; m < 12; m++) {
      const dayIdx = (new Date(Date.UTC(year, m, 1)).getTime() - jan1.getTime()) / 86400000
      monthStartWeeks.push(Math.floor((dayIdx + jan1Dow) / 7))
    }
    monthStartWeeks.push(totalWeeks)

    const spans: { month: number; span: number }[] = []
    for (let m = 0; m < 12; m++) {
      spans.push({ month: m, span: monthStartWeeks[m + 1] - monthStartWeeks[m] })
    }

    return { weeks: weeksArr, monthSpans: spans }
  }, [year])

  function getColorClass(value: number): string {
    if (value === 0 || maxValue === 0) return 'bg-slate-100 hover:bg-slate-200'
    const r = value / maxValue
    if (r <= 0.25) return 'bg-orange-100 hover:bg-orange-200'
    if (r <= 0.50) return 'bg-orange-300 hover:bg-orange-400'
    if (r <= 0.75) return 'bg-orange-500 hover:bg-orange-600'
    return 'bg-orange-700 hover:bg-orange-800'
  }

  const CELL = 16 // px — enlarged for readability
  const GAP = 3  // px
  const STEP = CELL + GAP
  const LABEL_COL = 30 // px for day-of-week labels

  const thisYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: thisYear - 2019 }, (_, i) => thisYear - i)

  // Tooltip content derived from hovered date
  const tooltipEntry = tooltip ? dayMap.get(tooltip.date) : undefined
  const tooltipDateLabel = tooltip
    ? new Date(tooltip.date + 'T00:00:00Z').toLocaleDateString(th ? 'th-TH' : 'en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : ''

  return (
    <div className="space-y-4 p-2">
      {!hideControls && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">{th ? 'ปี' : 'Year'}</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{th ? 'ไลน์' : 'Line'}</label>
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              <option value="all">{th ? 'ทุกไลน์' : 'All lines'}</option>
              {availableLines.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{th ? 'แสดงผล' : 'Metric'}</label>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => setMetric('count')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  metric === 'count' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {th ? 'ครั้ง' : 'Events'}
              </button>
              <button
                type="button"
                onClick={() => setMetric('min')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  metric === 'min' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {th ? 'นาที' : 'Minutes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex flex-col" style={{ gap: `${GAP}px` }}>
            {/* Month label row */}
            <div
              className="flex"
              style={{ marginLeft: `${LABEL_COL + GAP}px`, gap: `${GAP}px` }}
            >
              {monthSpans.map(({ month, span }) => (
                <div
                  key={month}
                  className="truncate text-xs font-medium text-slate-500"
                  style={{ width: `${span * CELL + Math.max(0, span - 1) * GAP}px` }}
                >
                  {MONTHS[month]}
                </div>
              ))}
            </div>

            {/* Day-of-week labels + week columns */}
            <div className="flex" style={{ gap: `${GAP}px` }}>
              {/* Day labels */}
              <div className="flex flex-col" style={{ gap: `${GAP}px`, width: `${LABEL_COL}px` }}>
                {DAY_LABELS.map((label, d) => (
                  <div
                    key={d}
                    className="flex items-center justify-end pr-1 text-[11px] text-slate-400"
                    style={{ height: `${CELL}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: `${GAP}px` }}>
                  {week.map((date, d) => {
                    if (!date) {
                      return <div key={d} style={{ width: CELL, height: CELL }} />
                    }
                    const entry = dayMap.get(date)
                    const value = entry ? (metric === 'count' ? entry.bdCount : entry.bdMin) : 0
                    return (
                      <div
                        key={d}
                        className={`cursor-pointer rounded-sm transition-colors ${getColorClass(value)}`}
                        style={{ width: CELL, height: CELL }}
                        onMouseEnter={(e) => {
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                          setTooltip({ date, x: rect.left + rect.width / 2, y: rect.top })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{th ? 'น้อย' : 'Less'}</span>
          {(['bg-slate-100', 'bg-orange-100', 'bg-orange-300', 'bg-orange-500', 'bg-orange-700'] as const).map(
            (cls) => (
              <div key={cls} className={`h-4 w-4 rounded-sm ${cls}`} />
            ),
          )}
          <span className="text-xs text-slate-400">{th ? 'มาก' : 'More'}</span>
          {maxValue > 0 && (
            <span className="ml-2 text-xs text-slate-400">
              {th
                ? `สูงสุด: ${maxValue.toLocaleString()} ${metric === 'count' ? 'ครั้ง' : 'นาที'}`
                : `Max: ${maxValue.toLocaleString()} ${metric === 'count' ? 'events' : 'min'}`}
            </span>
          )}
          {rows.length === 0 && (
            <span className="ml-2 text-xs text-slate-400">
              {th ? 'ไม่มีข้อมูล Breakdown ในปีนี้' : 'No breakdown data this year'}
            </span>
          )}
        </div>
      )}

      {/* Floating tooltip — position: fixed so it escapes overflow containers */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[10rem] max-w-[14rem] rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="mb-1 text-xs font-semibold text-slate-700">{tooltipDateLabel}</p>
          {tooltipEntry ? (
            <div className="space-y-0.5 text-xs text-slate-600">
              <p>
                <span className="font-medium text-orange-600">
                  {tooltipEntry.bdCount.toLocaleString()}
                </span>{' '}
                {th ? 'ครั้ง' : 'events'}
                {' · '}
                <span className="font-medium text-orange-600">
                  {tooltipEntry.bdMin.toLocaleString()}
                </span>{' '}
                {th ? 'นาที' : 'min'}
              </p>
              {tooltipEntry.topCat && (
                <p className="truncate text-slate-400">
                  {th ? 'หมวด: ' : 'Category: '}
                  <span className="text-slate-600">{tooltipEntry.topCat}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{th ? 'ไม่มี Breakdown' : 'No breakdown'}</p>
          )}
        </div>
      )}
    </div>
  )
}

type OperatorMatrixPayload = {
  monthKey: string
  daysInMonth: number
  rows: {
    operatorId: string
    employeeCode: string
    name: string
    cells: { parts: { partSamco: number; partName: string; okQty: number }[] }[]
  }[]
}

function OperatorMonthMatrixTable({
  matrix,
  th,
  emptyMessage,
}: {
  matrix: OperatorMatrixPayload
  th: boolean
  emptyMessage: string
}) {
  const unit = th ? 'ชิ้น' : 'pcs'
  const fmtCell = (parts: { partSamco: number; partName: string; okQty: number }[]) => {
    if (!parts.length) return ''
    return parts.map((p) => `${p.partSamco}\n${p.okQty.toLocaleString()} ${unit}`).join('\n\n')
  }

  const dayNums = Array.from({ length: matrix.daysInMonth }, (_, i) => i + 1)
  const codeW = 'min-w-[6.5rem] w-[6.5rem]'
  const nameSticky = 'left-[6.5rem]'

  return (
    <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
      <table className="min-w-max border-separate border-spacing-0 text-sm">
        <thead className={cn(DASHBOARD_THEAD_STICKY, 'z-40 bg-slate-100 shadow-sm')}>
          <tr>
            <th
              className={cn(
                'sticky z-40 border-r border-slate-200 px-2 py-2 text-left',
                DASHBOARD_MATRIX_TH_HEAD,
                'left-0',
                codeW,
              )}
            >
              {th ? 'รหัสพนักงาน' : 'Employee ID'}
            </th>
            <th
              className={cn(
                'sticky z-40 min-w-[10rem] w-[10rem] border-r border-slate-200 px-2 py-2 text-left',
                DASHBOARD_MATRIX_TH_HEAD,
                nameSticky,
              )}
            >
              {th ? 'ชื่อพนักงาน' : 'Name'}
            </th>
            {dayNums.map((d) => (
              <th
                key={d}
                className={cn(
                  'min-w-[5.5rem] max-w-[6.5rem] px-1 py-2 text-center leading-tight',
                  DASHBOARD_MATRIX_TH_HEAD,
                )}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.length === 0 ? (
            <tr>
              <td
                className="bg-white px-2 py-10 text-center text-slate-500"
                colSpan={2 + matrix.daysInMonth}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            matrix.rows.map((row) => (
              <tr key={row.operatorId} className="border-b border-slate-100 hover:bg-slate-50/70">
                <td
                  className={`sticky left-0 z-20 ${codeW} border-r border-slate-100 bg-white px-2 py-2 align-top font-mono text-xs text-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.04)]`}
                >
                  {row.employeeCode}
                </td>
                <td
                  className={`sticky ${nameSticky} z-20 min-w-[10rem] w-[10rem] border-r border-slate-200 bg-white px-2 py-2 align-top text-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.04)]`}
                >
                  {row.name}
                </td>
                {row.cells.map((c, i) => (
                  <td
                    key={i}
                    className="max-w-[6.5rem] whitespace-pre-line break-words border-l border-slate-50 px-1.5 py-2 align-top text-center text-[11px] leading-snug text-slate-700"
                  >
                    {fmtCell(c.parts) || '\u00a0'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function ReportSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          {icon}
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="min-w-0 p-2">{children}</div>
    </section>
  )
}

function SimpleTable({
  cols,
  rows,
  empty,
}: {
  cols: string[]
  rows: (string | ReactNode)[][]
  empty: string
}) {
  return (
    <div className={cn(DASHBOARD_TABLE_WRAP, 'max-w-full min-w-0 overflow-x-auto')}>
      <table className={DASHBOARD_TABLE_REPORT}>
        <thead className={DASHBOARD_THEAD_STICKY}>
          <tr>
            {cols.map((c) => (
              <th key={c} className={DASHBOARD_TH_STICKY_SOFT}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={cols.length}
                className="border border-slate-100 px-3 py-12 text-center text-sm font-medium text-slate-600"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                {cells.map((cell, j) => (
                  <td key={j} className="border border-slate-100 px-3 py-2 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
