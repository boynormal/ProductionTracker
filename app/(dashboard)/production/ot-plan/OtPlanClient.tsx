'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import useSWR from 'swr'
import * as XLSX from 'xlsx'
import { useI18n, type TranslationKey } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, RefreshCw, ChevronLeft, ChevronRight, Search, X, FileDown } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division {
  id: string
  divisionCode: string
  divisionName: string
}

interface Section {
  id: string
  sectionCode: string
  sectionName: string
  divisionId: string
}

interface Line {
  id: string
  lineCode: string
  lineName: string
  section?: {
    id: string
    sectionCode: string
    sectionName: string
    divisionId: string
    division?: { id: string } | null
  } | null
}

interface DayData {
  plan: number
  actual: number
  remark: string | null
}

interface MonthLineRow {
  lineId: string
  lineCode: string
  lineName: string
  days: Record<string, DayData>
  totals: { plan: number; actual: number; diff: number | null }
}

interface MonthResponse {
  data: MonthLineRow[]
  mode: 'month'
  days: string[]
  from: string
  to: string
}

interface MonthData {
  plan: number
  actual: number
  diff: number | null
}

interface YearLineRow {
  lineId: string
  lineCode: string
  lineName: string
  months: Record<string, MonthData>
  totals: { plan: number; actual: number; diff: number | null }
}

interface YearResponse {
  data: YearLineRow[]
  mode: 'year'
  year: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getDaysInMonth(yyyy: number, mm: number): number {
  return new Date(Date.UTC(yyyy, mm, 0)).getUTCDate()
}

function monthLabel(moKey: string, locale: string): string {
  const [y, m] = moKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function calcDiffPercent(plan: number, actual: number): number | null {
  if (plan <= 0) return null
  return Math.round(((actual - plan) / plan) * 1000) / 10
}

function diffBadge(
  diffPct: number | null,
  t: (key: TranslationKey) => string,
) {
  if (diffPct === null) return <span className="text-gray-400 text-xs">—</span>
  if (diffPct === 0) {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold border bg-gray-100 text-gray-600 border-gray-200">
        0%
      </span>
    )
  }
  const isUp = diffPct > 0
  const label = isUp ? t('otPlanDiffUp') : t('otPlanDiffDown')
  const formatted = isUp ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`
  const color = isUp
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-green-100 text-green-700 border-green-200'
  return (
    <span
      className={`inline-flex flex-col items-center rounded px-1 py-0.5 text-xs font-semibold border leading-tight ${color}`}
    >
      <span className="text-[10px] font-normal">{label}</span>
      <span>{formatted}</span>
    </span>
  )
}

/** Sticky offsets for summary columns (each w-14 = 56px) */
const SUM_PLAN_RIGHT = 'right-[112px]'
const SUM_ACTUAL_RIGHT = 'right-[56px]'
const SUM_DIFF_RIGHT = 'right-0'

const TABLE_SCROLL =
  'flex-1 min-h-0 -mx-4 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm'

// ─── Component ───────────────────────────────────────────────────────────────

interface OtPlanClientProps {
  userRole?: string | null
  divisions: Division[]
  sections: Section[]
  lines: Line[]
  initialMonth: string
  initialYear: string
}

export function OtPlanClient({
  userRole,
  divisions,
  sections,
  lines,
  initialMonth,
  initialYear,
}: OtPlanClientProps) {
  const { t, locale } = useI18n()
  const isAdmin = userRole === 'ADMIN'

  // ─── View state ───────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [selectedYear, setSelectedYear] = useState(initialYear)

  // ─── Filter state ─────────────────────────────────────────────────────────
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [lineFilter, setLineFilter] = useState('all')
  const [search, setSearch] = useState('')

  // ─── Draft edits (month mode): lineId|date -> hours ───────────────────────
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Filter cascades ──────────────────────────────────────────────────────
  const filteredSections = useMemo(
    () => (divisionFilter === 'all' ? sections : sections.filter((s) => s.divisionId === divisionFilter)),
    [sections, divisionFilter],
  )

  const filteredLines = useMemo(() => {
    let result = lines
    if (divisionFilter !== 'all') result = result.filter((l) => l.section?.divisionId === divisionFilter)
    if (sectionFilter !== 'all') result = result.filter((l) => l.section?.id === sectionFilter)
    if (lineFilter !== 'all') result = result.filter((l) => l.id === lineFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (l) =>
          l.lineCode.toLowerCase().includes(q) ||
          l.lineName.toLowerCase().includes(q),
      )
    }
    return result
  }, [lines, divisionFilter, sectionFilter, lineFilter, search])

  const filteredLineIds = useMemo(() => filteredLines.map((l) => l.id), [filteredLines])

  // Sections for line dropdown
  const sectionsForLineDropdown = useMemo(() => {
    if (sectionFilter !== 'all') return sections.filter((s) => s.id === sectionFilter)
    return filteredSections
  }, [sections, filteredSections, sectionFilter])

  const linesForLineDropdown = useMemo(() => {
    let result = lines
    if (divisionFilter !== 'all') result = result.filter((l) => l.section?.divisionId === divisionFilter)
    if (sectionFilter !== 'all') result = result.filter((l) => l.section?.id === sectionFilter)
    return result
  }, [lines, divisionFilter, sectionFilter])

  // active filter count for badge
  const activeFilterCount = [
    divisionFilter !== 'all',
    sectionFilter !== 'all',
    lineFilter !== 'all',
    search.trim() !== '',
  ].filter(Boolean).length

  const clearFilters = useCallback(() => {
    setDivisionFilter('all')
    setSectionFilter('all')
    setLineFilter('all')
    setSearch('')
    setDrafts({})
  }, [])

  // ─── SWR key (always fetch all lines for division; client filters display) ─
  const swrKey = useMemo(() => {
    const base = '/api/production/ot-plan'
    if (mode === 'month') {
      const params = new URLSearchParams({ mode: 'month', month: selectedMonth })
      if (divisionFilter !== 'all') params.set('divisionId', divisionFilter)
      return `${base}?${params}`
    }
    const params = new URLSearchParams({ mode: 'year', year: selectedYear })
    if (divisionFilter !== 'all') params.set('divisionId', divisionFilter)
    return `${base}?${params}`
  }, [mode, selectedMonth, selectedYear, divisionFilter])

  const { data: rawData, error, isLoading, mutate } = useSWR(swrKey, fetcher, {
    keepPreviousData: true,
  })

  // ─── Month navigation ─────────────────────────────────────────────────────
  const shiftMonth = useCallback(
    (delta: number) => {
      const [y, m] = selectedMonth.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 1 + delta, 1))
      setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
      setDrafts({})
      setSaveMsg(null)
    },
    [selectedMonth],
  )

  const shiftYear = useCallback((delta: number) => {
    setSelectedYear((y) => String(Number(y) + delta))
    setSaveMsg(null)
  }, [])

  // ─── Draft helpers ────────────────────────────────────────────────────────
  const getDraftOrPlan = useCallback(
    (lineId: string, day: string, planValue: number): number => {
      const key = `${lineId}|${day}`
      return key in drafts ? drafts[key] : planValue
    },
    [drafts],
  )

  const handleCellChange = useCallback((lineId: string, day: string, value: string) => {
    const n = parseInt(value, 10)
    const hours = isNaN(n) ? 0 : Math.min(24, Math.max(0, n))
    setDrafts((prev) => ({ ...prev, [`${lineId}|${day}`]: hours }))
    setSaveMsg(null)
  }, [])

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!isAdmin || Object.keys(drafts).length === 0) return
    setSaving(true)
    setSaveMsg(null)

    const items = Object.entries(drafts).map(([key, plannedHours]) => {
      const [lineId, planDate] = key.split('|')
      return { lineId, planDate, plannedHours }
    })

    try {
      const res = await fetch('/api/production/ot-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveMsg(String(err?.error ?? 'Error'))
      } else {
        setDrafts({})
        setSaveMsg(t('otPlanSaved'))
        mutate()
        if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current)
        saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 3000)
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
    }
  }, [isAdmin, drafts, mutate, t])

  // ─── Derived data ─────────────────────────────────────────────────────────
  const monthData = mode === 'month' ? (rawData as MonthResponse | undefined) : undefined
  const yearData = mode === 'year' ? (rawData as YearResponse | undefined) : undefined

  const [mY, mM] = selectedMonth.split('-').map(Number)
  const daysInMonth = getDaysInMonth(mY, mM)
  const allDays = Array.from({ length: daysInMonth }, (_, i) =>
    `${selectedMonth}-${String(i + 1).padStart(2, '0')}`,
  )

  const allMonths = Array.from({ length: 12 }, (_, i) =>
    `${selectedYear}-${String(i + 1).padStart(2, '0')}`,
  )

  // ─── Month mode rows + grand total ────────────────────────────────────────
  const monthRows: MonthLineRow[] = useMemo(() => {
    if (!monthData?.data) return []
    return monthData.data.filter((r) => filteredLineIds.includes(r.lineId))
  }, [monthData, filteredLineIds])

  const monthGrandTotal = useMemo(() => {
    let plan = 0
    let actual = 0
    for (const row of monthRows) {
      for (const day of allDays) {
        const d = row.days[day]
        plan += getDraftOrPlan(row.lineId, day, d?.plan ?? 0)
        actual += d?.actual ?? 0
      }
    }
    return { plan, actual, diff: calcDiffPercent(plan, actual) }
  }, [monthRows, allDays, getDraftOrPlan])

  // ─── Year mode rows + grand total ─────────────────────────────────────────
  const yearRows: YearLineRow[] = useMemo(() => {
    if (!yearData?.data) return []
    return yearData.data.filter((r) => filteredLineIds.includes(r.lineId) && r.months != null)
  }, [yearData, filteredLineIds])

  const yearGrandTotal = useMemo(() => {
    const acc: Record<string, { plan: number; actual: number }> = {}
    for (const mo of allMonths) acc[mo] = { plan: 0, actual: 0 }
    for (const row of yearRows) {
      for (const mo of allMonths) {
        const d = row.months?.[mo]
        if (!d) continue
        acc[mo].plan += d.plan
        acc[mo].actual += d.actual
      }
    }
    let totalPlan = 0
    let totalActual = 0
    const moTotals: Record<string, MonthData> = {}
    for (const mo of allMonths) {
      const { plan, actual } = acc[mo]
      totalPlan += plan
      totalActual += actual
      moTotals[mo] = { plan, actual, diff: calcDiffPercent(plan, actual) }
    }
    return {
      months: moTotals,
      totals: {
        plan: totalPlan,
        actual: totalActual,
        diff: calcDiffPercent(totalPlan, totalActual),
      },
    }
  }, [yearRows, allMonths])

  const hasDrafts = Object.keys(drafts).length > 0

  // ─── Donut / KPI summary ──────────────────────────────────────────────────
  /** Per-line totals used for the donut chart (respects filter + drafts) */
  const lineTotals = useMemo(() => {
    if (mode === 'month') {
      return monthRows.map((row) => {
        let plan = 0
        let actual = 0
        for (const day of allDays) {
          plan += getDraftOrPlan(row.lineId, day, row.days[day]?.plan ?? 0)
          actual += row.days[day]?.actual ?? 0
        }
        return { lineCode: row.lineCode, plan, actual }
      })
    }
    return yearRows.map((row) => ({
      lineCode: row.lineCode,
      plan: row.totals.plan,
      actual: row.totals.actual,
    }))
  }, [mode, monthRows, yearRows, allDays, getDraftOrPlan])

  const grandTotal = mode === 'month' ? monthGrandTotal : yearGrandTotal.totals

  /** Lines split into 3 Diff bands for the donut */
  const donutData = useMemo(() => {
    let low = 0   // actual/plan ≤ 100%  (≤ 0% diff)
    let near = 0  // 100-110%            (0-10% diff)
    let over = 0  // > 110%              (> 10% diff)
    let noPlan = 0
    for (const { plan, actual } of lineTotals) {
      if (plan === 0) { noPlan++; continue }
      const ratio = actual / plan
      if (ratio <= 1.0) low++
      else if (ratio <= 1.1) near++
      else over++
    }
    const total = low + near + over + noPlan
    if (total === 0) return []
    const items = []
    if (low > 0) items.push({ name: `ต่ำกว่าแผน (≤100%)`, count: low, fill: '#16a34a' })
    if (near > 0) items.push({ name: `ใกล้แผน (101-110%)`, count: near, fill: '#d97706' })
    if (over > 0) items.push({ name: `เกินแผน (>110%)`, count: over, fill: '#dc2626' })
    if (noPlan > 0) items.push({ name: `ไม่มีแผน`, count: noPlan, fill: '#d1d5db' })
    return items
  }, [lineTotals])

  // ─── Export Excel ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new()

    if (mode === 'month') {
      if (!monthData?.data) return
      const title = `แผน OT ${selectedMonth}`
      const days = monthData.days ?? []

      const header = ['สายการผลิต', ...days, 'แผนรวม', 'จริงรวม', 'Diff (%)']
      const rows: (string | number)[][] = [header]

      for (const row of monthRows) {
        let rowPlan = 0
        let rowActual = 0
        const cells: (string | number)[] = [`${row.lineCode} ${row.lineName}`]
        for (const day of days) {
          const plan = getDraftOrPlan(row.lineId, day, row.days[day]?.plan ?? 0)
          const actual = row.days[day]?.actual ?? 0
          rowPlan += plan
          rowActual += actual
          cells.push(plan > 0 || actual > 0 ? `${plan} / ${actual}` : '')
        }
        const diff = calcDiffPercent(rowPlan, rowActual)
        cells.push(rowPlan, rowActual, diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—')
        rows.push(cells)
      }

      const gt = monthGrandTotal
      const totalDiff = gt.diff !== null ? `${gt.diff > 0 ? '+' : ''}${gt.diff.toFixed(1)}%` : '—'
      rows.push(['รวมทั้งหมด', ...days.map(() => ''), gt.plan, gt.actual, totalDiff])

      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31))
    } else {
      if (!yearData?.data) return
      const title = `แผน OT ${selectedYear}`
      const months = Array.from({ length: 12 }, (_, i) =>
        `${selectedYear}-${String(i + 1).padStart(2, '0')}`,
      )
      const monthLabels = months.map((m) => {
        const [y, mo] = m.split('-').map(Number)
        return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('th-TH', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      })

      const header = ['สายการผลิต', ...monthLabels, 'แผนรวม', 'จริงรวม', 'Diff (%)']
      const rows: (string | number)[][] = [header]

      for (const row of yearRows) {
        const cells: (string | number)[] = [`${row.lineCode} ${row.lineName}`]
        for (const mo of months) {
          const d = row.months?.[mo]
          cells.push(d ? `${d.plan} / ${d.actual}` : '')
        }
        const diff = row.totals.diff
        cells.push(row.totals.plan, row.totals.actual, diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—')
        rows.push(cells)
      }

      const gt = yearGrandTotal.totals
      const totalDiff = gt.diff !== null ? `${gt.diff > 0 ? '+' : ''}${gt.diff.toFixed(1)}%` : '—'
      rows.push(['รวมทั้งหมด', ...months.map(() => ''), gt.plan, gt.actual, totalDiff])

      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31))
    }

    XLSX.writeFile(wb, mode === 'month' ? `OT_Plan_${selectedMonth}.xlsx` : `OT_Plan_${selectedYear}.xlsx`)
  }, [mode, monthData, yearData, monthRows, yearRows, monthGrandTotal, yearGrandTotal, selectedMonth, selectedYear, getDraftOrPlan])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">

      {/* ── Top bar: title + mode tabs + actions ─────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 shrink-0">{t('productionOtPlan')}</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'month' | 'year'); setDrafts({}) }}>
            <TabsList className="h-9">
              <TabsTrigger value="month">{t('otPlanMonthMode')}</TabsTrigger>
              <TabsTrigger value="year">{t('otPlanYearMode')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'month' && isAdmin && (
            <Button size="sm" onClick={handleSave} disabled={saving || !hasDrafts} className="gap-1">
              <Save size={14} />
              {saving ? t('otPlanSaving') : t('otPlanSave')}
              {hasDrafts && !saving && (
                <Badge className="ml-1 bg-white text-blue-700 text-xs px-1 py-0">
                  {Object.keys(drafts).length}
                </Badge>
              )}
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => mutate()} className="w-8 h-9 p-0">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* ── Date navigator + compact summary ────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">

        {/* 1. Date picker — leftmost */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === 'month' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} className="h-7 w-7 p-0 shrink-0">
                <ChevronLeft size={13} />
              </Button>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setDrafts({}) }}
                className="h-7 w-44 min-w-[11rem] text-sm pr-2 [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:mr-1"
              />
              <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} className="h-7 w-7 p-0 shrink-0">
                <ChevronRight size={13} />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => shiftYear(-1)} className="h-7 w-7 p-0">
                <ChevronLeft size={13} />
              </Button>
              <Input
                type="number"
                value={selectedYear}
                min={2020}
                max={2100}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-20 h-7 text-sm text-center"
              />
              <Button variant="outline" size="sm" onClick={() => shiftYear(1)} className="h-7 w-7 p-0">
                <ChevronRight size={13} />
              </Button>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-8 bg-gray-200 shrink-0" />

        {/* 2. Donut chart + legend */}
        {!isLoading && !error && donutData.length > 0 && (
          <>
            <div className="flex items-center gap-2 shrink-0">
              <PieChart width={52} height={52}>
                <Pie
                  data={donutData}
                  dataKey="count"
                  cx={24}
                  cy={24}
                  innerRadius={14}
                  outerRadius={24}
                  strokeWidth={1}
                  stroke="#fff"
                  paddingAngle={2}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: number, _: string, props: { payload?: { name?: string } }) =>
                    [`${value} สาย`, props.payload?.name ?? '']
                  }
                />
              </PieChart>
              <div className="flex flex-col gap-0.5">
                {donutData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: entry.fill }} />
                    <span className="text-[10px] text-gray-500 leading-tight whitespace-nowrap">{entry.name}</span>
                    <span className="text-[10px] font-semibold text-gray-700 ml-0.5">{entry.count} สาย</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200 shrink-0" />
          </>
        )}

        {/* 3. KPI chips */}
        {!isLoading && !error && (grandTotal.plan > 0 || grandTotal.actual > 0) && (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* แผน */}
            <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
              <span className="text-[10px] text-gray-400 whitespace-nowrap">แผน OT</span>
              <span className="text-sm font-bold text-blue-700 tabular-nums">{grandTotal.plan}</span>
              <span className="text-[10px] text-gray-400">ชม.</span>
            </div>
            {/* จริง */}
            <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
              <span className="text-[10px] text-gray-400 whitespace-nowrap">จริง</span>
              <span className={`text-sm font-bold tabular-nums ${grandTotal.actual > grandTotal.plan && grandTotal.plan > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {grandTotal.actual}
              </span>
              <span className="text-[10px] text-gray-400">ชม.</span>
            </div>
            {/* ส่วนต่าง */}
            {grandTotal.plan > 0 && (() => {
              const delta = grandTotal.actual - grandTotal.plan
              return (
                <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">ส่วนต่าง</span>
                  <span className={`text-sm font-bold tabular-nums ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                  <span className="text-[10px] text-gray-400">ชม.</span>
                </div>
              )
            })()}
            {/* Diff % */}
            {grandTotal.plan > 0 && grandTotal.diff !== null && (() => {
              const d = grandTotal.diff
              return (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">Diff</span>
                  <span className={`text-sm font-bold tabular-nums ${d > 0 ? 'text-red-600' : d < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}%
                  </span>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-end gap-2 bg-gray-50 rounded-lg border border-gray-200 p-3">
        {/* Division */}
        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-500">ฝ่าย</label>
          <Select
            value={divisionFilter}
            onValueChange={(v) => {
              setDivisionFilter(v)
              setSectionFilter('all')
              setLineFilter('all')
              setDrafts({})
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="ทุกฝ่าย" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกฝ่าย</SelectItem>
              {divisions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.divisionCode} {d.divisionName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section */}
        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-500">ส่วน</label>
          <Select
            value={sectionFilter}
            onValueChange={(v) => {
              setSectionFilter(v)
              setLineFilter('all')
              setDrafts({})
            }}
            disabled={filteredSections.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="ทุกส่วน" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกส่วน</SelectItem>
              {filteredSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.sectionCode} {s.sectionName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Line */}
        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-500">สายการผลิต</label>
          <Select
            value={lineFilter}
            onValueChange={(v) => { setLineFilter(v); setDrafts({}) }}
            disabled={linesForLineDropdown.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="ทุกสาย" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสาย</SelectItem>
              {linesForLineDropdown.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.lineCode} {l.lineName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-gray-500">ค้นหา</label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="รหัส / ชื่อสาย..."
              className="h-8 text-xs pl-7 pr-7"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Export Excel */}
        <div className="flex flex-col gap-1 self-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isLoading || !!error}
            className="h-8 gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <FileDown size={13} />
            Excel
          </Button>
        </div>

        {/* Clear button */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs text-gray-500 self-end">
            <X size={12} />
            ล้าง ({activeFilterCount})
          </Button>
        )}

        {/* Result count */}
        <div className="self-end text-xs text-gray-400 pb-1 ml-auto">
          {filteredLines.length} สาย
        </div>
      </div>

      {/* ── Save feedback ────────────────────────────────────────────────── */}
      {saveMsg && (
        <div
          className={`shrink-0 text-sm px-3 py-2 rounded border ${
            saveMsg === t('otPlanSaved')
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* ── Loading / error ──────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}
      {error && (
        <div className="text-red-600 text-sm p-3 bg-red-50 rounded border border-red-200">
          Error loading data
        </div>
      )}

      {/* ── Month Table ──────────────────────────────────────────────────── */}
      {!isLoading && !error && mode === 'month' && (
        <>
          <div className={TABLE_SCROLL} style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="text-xs border-separate border-spacing-0 w-max min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {/* Fixed line column — sticky top + left */}
                    <th className="sticky left-0 top-0 z-40 bg-gray-50 text-left px-2 py-2 font-semibold text-gray-700 w-28 min-w-[112px] border-r border-b border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                      {t('line')}
                    </th>
                    {allDays.map((day) => {
                      const d = new Date(day + 'T00:00:00Z')
                      const dow = d.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
                        weekday: 'short',
                        timeZone: 'UTC',
                      })
                      const dayNum = d.getUTCDate()
                      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
                      return (
                        <th
                          key={day}
                          className={`sticky top-0 z-30 px-0.5 py-1 text-center font-medium w-9 min-w-[36px] border-r border-b border-gray-200 ${
                            isWeekend ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <div className="font-bold leading-tight">{dayNum}</div>
                          <div className="text-gray-400 font-normal text-[9px] leading-tight">{dow}</div>
                        </th>
                      )
                    })}
                    <th className={`sticky top-0 ${SUM_PLAN_RIGHT} z-30 px-1.5 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l-2 border-b border-gray-300 bg-blue-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                      แผนรวม
                    </th>
                    <th className={`sticky top-0 ${SUM_ACTUAL_RIGHT} z-30 px-1.5 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l border-b border-gray-200 bg-blue-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                      จริงรวม
                    </th>
                    <th className={`sticky top-0 ${SUM_DIFF_RIGHT} z-30 px-1 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l border-b border-gray-200 bg-blue-50`}>
                      {t('otPlanDiff')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={allDays.length + 4}
                        className="text-center py-10 text-gray-400"
                      >
                        {t('otPlanNoData')}
                      </td>
                    </tr>
                  ) : (
                    monthRows.map((row, ri) => {
                      let rowPlan = 0
                      let rowActual = 0
                      return (
                        <tr
                          key={row.lineId}
                          className={`border-b border-gray-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                        >
                          {/* Fixed line cell */}
                          <td className={`sticky left-0 z-20 bg-inherit px-2 py-1.5 border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.07)] ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                            <div className="font-semibold text-gray-800 leading-tight text-xs">{row.lineCode}</div>
                            <div className="text-gray-400 text-[10px] leading-tight truncate max-w-[120px]">
                              {row.lineName}
                            </div>
                          </td>

                          {allDays.map((day) => {
                            const d = row.days[day]
                            const plan = getDraftOrPlan(row.lineId, day, d?.plan ?? 0)
                            const actual = d?.actual ?? 0
                            rowPlan += plan
                            rowActual += actual
                            const isWeekend =
                              new Date(day + 'T00:00:00Z').getUTCDay() === 0 ||
                              new Date(day + 'T00:00:00Z').getUTCDay() === 6
                            const isEdited = `${row.lineId}|${day}` in drafts

                            // Cell status → background
                            const hasData = plan > 0 || actual > 0
                            const cellBg = isEdited
                              ? 'bg-blue-50'
                              : actual > 0 && plan === 0
                              ? 'bg-amber-50'           // OT จริงแต่ไม่มีแผน
                              : actual > plan && plan > 0
                              ? 'bg-red-50'             // เกินแผน
                              : actual > 0 && actual <= plan
                              ? 'bg-emerald-50'         // อยู่ในแผน
                              : isWeekend && !hasData
                              ? 'bg-orange-50/40'       // เสาร์/อาทิตย์ ไม่มีข้อมูล
                              : ''

                            return (
                              <td
                                key={day}
                                className={`border-r border-gray-100 last:border-r-0 ${cellBg}`}
                                style={{ padding: '3px 2px', verticalAlign: 'middle' }}
                              >
                                <div className="flex flex-col items-center gap-0" style={{ minHeight: 32 }}>
                                  {/* Plan row */}
                                  {isAdmin ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={24}
                                      value={plan}
                                      onChange={(e) => handleCellChange(row.lineId, day, e.target.value)}
                                      className={`h-4 w-8 text-[10px] text-center rounded border outline-none focus:ring-1 focus:ring-blue-400 ${
                                        isEdited
                                          ? 'border-blue-400 text-blue-700 font-semibold'
                                          : plan > 0
                                          ? 'border-gray-300 text-gray-600'
                                          : 'border-transparent text-gray-300'
                                      } bg-transparent`}
                                    />
                                  ) : plan > 0 ? (
                                    <span className="text-[11px] text-gray-400 leading-tight font-medium">
                                      {plan}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-gray-200 leading-tight">—</span>
                                  )}

                                  {/* Actual row — always reserve space for alignment */}
                                  <span
                                    className={`text-[12px] font-bold leading-tight ${
                                      actual === 0
                                        ? 'text-transparent select-none'
                                        : actual > plan && plan > 0
                                        ? 'text-red-600'
                                        : actual > 0 && plan === 0
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}
                                  >
                                    {actual > 0 ? actual : '·'}
                                  </span>
                                </div>
                              </td>
                            )
                          })}

                          {/* Summary columns — sticky right */}
                          <td className={`sticky ${SUM_PLAN_RIGHT} z-10 px-1.5 py-1.5 text-center border-l-2 border-gray-300 bg-slate-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)] ${ri % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100'}`}>
                            <div className="text-[10px] text-gray-500 leading-tight">แผน</div>
                            <div className="text-xs font-bold text-gray-800 leading-tight">{rowPlan || '—'}</div>
                          </td>
                          <td className={`sticky ${SUM_ACTUAL_RIGHT} z-10 px-1.5 py-1.5 text-center border-l border-gray-200 bg-slate-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)] ${ri % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100'}`}>
                            <div className="text-[10px] text-gray-500 leading-tight">จริง</div>
                            <div className={`text-xs font-bold leading-tight ${rowActual > rowPlan && rowPlan > 0 ? 'text-red-600' : rowActual > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {rowActual || '—'}
                            </div>
                          </td>
                          <td className={`sticky ${SUM_DIFF_RIGHT} z-10 px-1 py-1.5 text-center border-l border-gray-200 ${ri % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100'}`}>
                            {diffBadge(calcDiffPercent(rowPlan, rowActual), t)}
                          </td>
                        </tr>
                      )
                    })
                  )}

                  {/* Grand total row */}
                  {monthRows.length > 0 && (
                    <tr className="border-t-2 border-gray-400 bg-gray-100">
                      <td className="sticky left-0 z-20 bg-gray-100 px-2 py-2 border-r border-gray-300 text-gray-700 font-bold text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.07)]">
                        {t('otPlanTotalRow')}
                      </td>
                      {allDays.map((day) => {
                        const dayPlan = monthRows.reduce(
                          (s, r) => s + getDraftOrPlan(r.lineId, day, r.days[day]?.plan ?? 0),
                          0,
                        )
                        const dayActual = monthRows.reduce(
                          (s, r) => s + (r.days[day]?.actual ?? 0),
                          0,
                        )
                        const isWeekend =
                          new Date(day + 'T00:00:00Z').getUTCDay() === 0 ||
                          new Date(day + 'T00:00:00Z').getUTCDay() === 6
                        const totalBg = dayActual > dayPlan && dayPlan > 0
                          ? 'bg-red-100'
                          : dayActual > 0 && dayActual <= dayPlan
                          ? 'bg-emerald-100'
                          : dayActual > 0 && dayPlan === 0
                          ? 'bg-amber-100'
                          : isWeekend
                          ? 'bg-orange-50'
                          : ''
                        return (
                          <td
                            key={day}
                            className={`border-r border-gray-200 text-center ${totalBg}`}
                            style={{ padding: '3px 2px', verticalAlign: 'middle' }}
                          >
                            {dayPlan > 0 && (
                              <div className="text-[10px] text-gray-500 font-medium leading-tight">{dayPlan}</div>
                            )}
                            {dayActual > 0 && (
                              <div className={`text-[12px] font-bold leading-tight ${
                                dayActual > dayPlan && dayPlan > 0 ? 'text-red-600'
                                : dayPlan === 0 ? 'text-amber-600'
                                : 'text-emerald-600'
                              }`}>{dayActual}</div>
                            )}
                            {dayPlan === 0 && dayActual === 0 && (
                              <div className="text-[11px] text-gray-300 leading-tight">·</div>
                            )}
                          </td>
                        )
                      })}
                      <td className={`sticky ${SUM_PLAN_RIGHT} z-10 px-1.5 py-2 text-center border-l-2 border-gray-400 bg-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                        <div className="text-[10px] text-gray-500">แผน</div>
                        <div className="text-xs font-bold text-gray-800">{monthGrandTotal.plan}</div>
                      </td>
                      <td className={`sticky ${SUM_ACTUAL_RIGHT} z-10 px-1.5 py-2 text-center border-l border-gray-300 bg-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                        <div className="text-[10px] text-gray-500">จริง</div>
                        <div className={`text-xs font-bold ${monthGrandTotal.actual > monthGrandTotal.plan && monthGrandTotal.plan > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {monthGrandTotal.actual}
                        </div>
                      </td>
                      <td className={`sticky ${SUM_DIFF_RIGHT} z-10 px-1 py-2 text-center border-l border-gray-300 bg-slate-200`}>
                        {diffBadge(monthGrandTotal.diff, t)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
          </div>

          {/* Legend */}
          <div className="flex shrink-0 flex-wrap gap-3 text-xs text-gray-500 pt-1">
            {isAdmin && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-50 border border-blue-400 inline-block" />
                แก้ไขแล้ว
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-emerald-50 border border-emerald-300" />
              จริง ≤ แผน
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-300" />
              จริง &gt; แผน
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-300" />
              OT จริง (ไม่มีแผน)
            </span>
            <span className="text-gray-400 ml-2">แถวบน = แผน (เทา) · แถวล่าง = จริง (สี) · เลื่อนซ้าย-ขวาดูวันครบเดือน</span>
          </div>
        </>
      )}

      {/* ── Year Table ───────────────────────────────────────────────────── */}
      {!isLoading && !error && mode === 'year' && (
        <div className={TABLE_SCROLL} style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="text-xs border-separate border-spacing-0 w-max min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 top-0 z-40 bg-gray-50 text-left px-2 py-2 font-semibold text-gray-700 w-28 min-w-[112px] border-r border-b border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    {t('line')}
                  </th>
                  {allMonths.map((mo) => (
                    <th
                      key={mo}
                      className="sticky top-0 z-30 px-1.5 py-2 text-center font-medium text-gray-600 w-16 min-w-[64px] border-r border-b border-gray-200 bg-gray-50"
                    >
                      {monthLabel(mo, locale)}
                    </th>
                  ))}
                  <th className={`sticky top-0 ${SUM_PLAN_RIGHT} z-30 px-1.5 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l-2 border-b border-gray-300 bg-blue-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                    แผนรวม
                  </th>
                  <th className={`sticky top-0 ${SUM_ACTUAL_RIGHT} z-30 px-1.5 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l border-b border-gray-200 bg-blue-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                    จริงรวม
                  </th>
                  <th className={`sticky top-0 ${SUM_DIFF_RIGHT} z-30 px-1 py-2 text-center font-semibold text-gray-700 w-14 min-w-[56px] border-l border-b border-gray-200 bg-blue-50`}>
                    {t('otPlanDiff')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {yearRows.length === 0 ? (
                  <tr>
                    <td colSpan={allMonths.length + 4} className="text-center py-10 text-gray-400">
                      {t('otPlanNoData')}
                    </td>
                  </tr>
                ) : (
                  yearRows.map((row, ri) => (
                    <tr key={row.lineId} className={`border-b border-gray-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                      <td className={`sticky left-0 z-20 px-2 py-1.5 border-r border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.07)] ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <div className="font-semibold text-gray-800 leading-tight">{row.lineCode}</div>
                        <div className="text-gray-400 text-[10px] leading-tight truncate max-w-[108px]">
                          {row.lineName}
                        </div>
                      </td>
                      {allMonths.map((mo) => {
                        const d = row.months?.[mo] ?? { plan: 0, actual: 0, diff: null }
                        return (
                          <td
                            key={mo}
                            className="px-1.5 py-1.5 text-center border-r border-gray-100"
                          >
                            <div className="text-gray-700 text-[11px]">
                              {d.plan > 0 ? d.plan : '—'}
                            </div>
                            {d.actual > 0 && (
                              <div
                                className={`text-[10px] font-semibold ${
                                  d.actual > d.plan && d.plan > 0 ? 'text-red-600' : 'text-green-700'
                                }`}
                              >
                                {d.actual}
                              </div>
                            )}
                            {d.plan > 0 && <div className="mt-0.5">{diffBadge(d.diff, t)}</div>}
                          </td>
                        )
                      })}
                      <td className={`sticky ${SUM_PLAN_RIGHT} z-10 px-1.5 py-1.5 text-center font-semibold text-gray-800 border-l-2 border-gray-300 bg-blue-50/80 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                        {row.totals.plan}
                      </td>
                      <td className={`sticky ${SUM_ACTUAL_RIGHT} z-10 px-1.5 py-1.5 text-center font-semibold text-blue-700 border-l border-gray-200 bg-blue-50/80 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                        {row.totals.actual}
                      </td>
                      <td className={`sticky ${SUM_DIFF_RIGHT} z-10 px-1 py-1.5 text-center border-l border-gray-200 bg-blue-50/80`}>
                        {diffBadge(row.totals.diff, t)}
                      </td>
                    </tr>
                  ))
                )}

                {/* Grand total */}
                {yearRows.length > 0 && (
                  <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                    <td className="sticky left-0 z-20 bg-gray-100 px-2 py-2 border-r border-gray-200 text-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.07)]">
                      {t('otPlanTotalRow')}
                    </td>
                    {allMonths.map((mo) => {
                      const d = yearGrandTotal.months[mo] ?? { plan: 0, actual: 0, diff: null }
                      return (
                        <td
                          key={mo}
                          className="px-1.5 py-2 text-center text-[11px] border-r border-gray-200"
                        >
                          {d.plan > 0 && <div className="text-gray-700">{d.plan}</div>}
                          {d.actual > 0 && <div className="text-blue-600">{d.actual}</div>}
                          {d.plan > 0 && <div>{diffBadge(d.diff, t)}</div>}
                        </td>
                      )
                    })}
                    <td className={`sticky ${SUM_PLAN_RIGHT} z-10 px-1.5 py-2 text-center border-l-2 border-gray-300 bg-blue-100 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                      {yearGrandTotal.totals.plan}
                    </td>
                    <td className={`sticky ${SUM_ACTUAL_RIGHT} z-10 px-1.5 py-2 text-center text-blue-700 border-l border-gray-200 bg-blue-100 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.07)]`}>
                      {yearGrandTotal.totals.actual}
                    </td>
                    <td className={`sticky ${SUM_DIFF_RIGHT} z-10 px-1 py-2 text-center border-l border-gray-200 bg-blue-100`}>
                      {diffBadge(yearGrandTotal.totals.diff, t)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}
