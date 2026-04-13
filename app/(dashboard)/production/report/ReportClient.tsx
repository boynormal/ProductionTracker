'use client'

import { useMemo, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { format, subDays } from 'date-fns'
import { BarChart3, Loader2, Users, Package, Cog, Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { getOeeBg } from '@/lib/utils/oee'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  sections: { id: string; sectionCode: string; sectionName: string }[]
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

export function ReportClient({ sections }: Props) {
  const { locale } = useI18n()
  const th = locale === 'th'

  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sectionFilter, setSectionFilter] = useState('all')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [operatorSearch, setOperatorSearch] = useState('')

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      granularity,
    })
    if (sectionFilter !== 'all') p.set('sectionId', sectionFilter)
    return p.toString()
  }, [dateFrom, dateTo, sectionFilter, granularity])

  const { data, error, isLoading, isValidating } = useSWR(`/api/production/reports?${qs}`, fetcher, {
    keepPreviousData: true,
  })

  const byOperator = data?.byOperator ?? []
  const byPart = data?.byPart ?? []
  const byMachine = data?.byMachine ?? []
  const operatorMonthMatrix = data?.operatorMonthMatrix ?? null
  const apiError = data?.error ?? error?.message

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
  const hasPayload = data != null && !fetchFailed
  const operatorsReportEmpty =
    granularity === 'month'
      ? (operatorMonthMatrix?.rows?.length ?? 0) === 0
      : byOperator.length === 0
  const allEmpty =
    hasPayload && operatorsReportEmpty && byPart.length === 0 && byMachine.length === 0
  const showLoadingBlock = isLoading && !data && !fetchFailed

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <BarChart3 size={22} className="text-blue-600" />
          {th ? 'รายงานการผลิต' : 'Production reports'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {th
            ? 'สรุปจาก Session ที่กำลังเปิดกะหรือปิดกะแล้ว (ไม่รวมที่ยกเลิก) — เลือกแท็บด้านล่าง'
            : 'Includes open and completed sessions (excludes cancelled) — use the tabs below'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        {granularity === 'month' ? (
          <div>
            <label className="mb-1 block text-xs text-slate-500">{th ? 'เดือน' : 'Month'}</label>
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
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{th ? 'จากวันที่' : 'From'}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{th ? 'ถึงวันที่' : 'To'}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'ส่วน' : 'Section'}</label>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="max-w-[min(100%,20rem)] rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="all">{th ? 'ทุกส่วน' : 'All sections'}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sectionCode} — {s.sectionName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{th ? 'มุมมอง' : 'View'}</label>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setGranularity('day')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                granularity === 'day' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {th ? 'รายวัน' : 'Daily'}
            </button>
            <button
              type="button"
              onClick={() => {
                setGranularity('month')
                const r = monthPickerToRange(dateFrom.slice(0, 7))
                if (r) {
                  setDateFrom(r.from)
                  setDateTo(r.to)
                }
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                granularity === 'month' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {th ? 'รายเดือน' : 'Monthly'}
            </button>
          </div>
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

      {isValidating && data && (
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
          <TabsList className="grid h-auto w-full max-w-2xl grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="operators" className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm">
              <Users className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              {th ? 'พนักงาน' : 'Operators'}
            </TabsTrigger>
            <TabsTrigger value="parts" className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm">
              <Package className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              Part
            </TabsTrigger>
            <TabsTrigger value="machines" className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm">
              <Cog className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              {th ? 'เครื่องจักร' : 'Machines'}
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="machines" className="mt-4">
            <ReportSection
              icon={<Cog className="text-amber-600" size={20} />}
              title={th ? 'เครื่องจักร — ประสิทธิภาพรวม (OEE%) ต่อช่วง' : 'Machines — OEE % by period'}
              subtitle={
                th
                  ? 'คิดจากชั่วโมงที่มีบันทึกของเครื่องนั้น (1 แถว = 1 ชม.) และ Breakdown/NG ของแถวนั้น — รวม Session ที่ยังเปิดกะ (ค่า OEE เป็นภาพระหว่างกะ)'
                  : 'Per machine-hour row; includes open sessions (OEE is in-shift / preliminary until close).'
              }
            >
              <SimpleTable
                empty={
                  th
                    ? 'ไม่มีข้อมูลเครื่อง (ต้องระบุเครื่องในบันทึกรายชั่วโมง)'
                    : 'No machine-attributed hourly rows'
                }
                cols={[
                  th ? 'เครื่อง' : 'Machine',
                  th ? 'สาย' : 'Line',
                  periodLabel,
                  'OEE%',
                  th ? 'Avail' : 'Avail%',
                  th ? 'Perf' : 'Perf%',
                  th ? 'Qual' : 'Qual%',
                  th ? 'OK' : 'OK',
                ]}
                rows={byMachine.map(
                  (r: {
                    mcNo: string
                    lineCode: string
                    period: string
                    oee: number
                    availability: number
                    performance: number
                    quality: number
                    okQty: number
                  }) => [
                    r.mcNo,
                    r.lineCode,
                    r.period,
                    <span className={`font-bold ${getOeeBg(r.oee)} rounded px-2 py-0.5`}>{r.oee}%</span>,
                    `${r.availability}%`,
                    `${r.performance}%`,
                    `${r.quality}%`,
                    r.okQty.toLocaleString(),
                  ],
                )}
              />
            </ReportSection>
          </TabsContent>
        </Tabs>
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
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-600">
            <th
              className={`sticky left-0 z-30 ${codeW} border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}
            >
              {th ? 'รหัสพนักงาน' : 'Employee ID'}
            </th>
            <th
              className={`sticky ${nameSticky} z-30 min-w-[10rem] w-[10rem] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}
            >
              {th ? 'ชื่อพนักงาน' : 'Name'}
            </th>
            {dayNums.map((d) => (
              <th
                key={d}
                className="min-w-[5.5rem] max-w-[6.5rem] border-b border-slate-200 px-1 py-2 text-center font-medium leading-tight"
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
      <div className="p-2">{children}</div>
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={cols.length}
                className="px-3 py-12 text-center text-sm font-medium text-slate-600"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                {cells.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-slate-700">
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
