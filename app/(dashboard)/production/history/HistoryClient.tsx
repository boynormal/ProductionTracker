'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import { formatUtcCalendarDate } from '@/lib/time-utils'
import { Search, Wrench, XCircle, Loader2, CalendarDays, Factory, ChevronDown, Layers, LayoutList } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'
import { HistoryHourlyEditDialog } from './HistoryHourlyEditDialog'
import { getBangkokHour, isBangkokDayShiftHour } from '@/lib/utils/thai-time'
import { canonicalDivisionName } from '@/lib/org-display'

interface LineRow {
  id: string
  lineCode: string
  lineName?: string
  section?: {
    id?: string
    sectionCode: string
    sectionName: string
    division?: {
      id?: string
      divisionCode: string
      divisionName: string
      department?: {
        departmentCode: string
        departmentName: string
      }
    }
  } | null
}

const EDIT_ROLES = new Set(['SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'])

/**
 * หัวตารางหลัก — sticky บน <th> ต้องใช้กับ `border-separate` (ไม่ใช้ border-collapse)
 * มิฉะนั้นบาง Chromium/WebKit จะไม่แสดงแถวหัวเมื่อใช้ position:sticky ที่ th
 */
const HISTORY_MAIN_HEAD_TH =
  'sticky top-0 z-20 border border-slate-200 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)]'

function recordForHourSlot(records: any[], slot: number) {
  return records.find((r: any) => Number(r.hourSlot) === slot)
}

function normalizeLine(s: string) {
  return s.toLowerCase().replace(/[\s\-_.,]/g, '')
}

type LineDayNight = {
  lineId: string
  line: any
  day: any | null
  night: any | null
}

function inferHistoryDisplayShift(sess: any): 'DAY' | 'NIGHT' {
  const dbShift: 'DAY' | 'NIGHT' = sess.shiftType === 'NIGHT' ? 'NIGHT' : 'DAY'
  const records = Array.isArray(sess.hourlyRecords) ? sess.hourlyRecords : []
  let dayVotes = 0
  let nightVotes = 0
  for (const r of records) {
    if (!r.recordTime) continue
    const h = getBangkokHour(new Date(r.recordTime))
    if (isBangkokDayShiftHour(h)) dayVotes++
    else nightVotes++
  }
  if (dayVotes + nightVotes === 0) return dbShift
  if (dayVotes > nightVotes) return 'DAY'
  if (nightVotes > dayVotes) return 'NIGHT'
  return dbShift
}

function pickBetterSession(existing: any, incoming: any, bucket: 'DAY' | 'NIGHT'): any {
  const exN = existing?.hourlyRecords?.length ?? 0
  const inN = incoming?.hourlyRecords?.length ?? 0
  if (inN > 0 && exN === 0) return incoming
  if (exN > 0 && inN === 0) return existing
  const exMatch = existing?.shiftType === bucket
  const inMatch = incoming?.shiftType === bucket
  if (inMatch && !exMatch) return incoming
  if (exMatch && !inMatch) return existing
  return inN >= exN ? incoming : existing
}

/** รวม session ของวันเดียวกันเป็น 1 Line = กะเช้า + กะดึก */
function groupSessionsByLine(sessionList: any[], allLines: any[]): LineDayNight[] {
  const map = new Map<string, { day?: any; night?: any; line?: any }>()

  // เพิ่มทุก Line ลงใน map ก่อน
  for (const l of allLines) {
    map.set(l.id, { line: l })
  }

  for (const s of sessionList) {
    const lid = s.lineId ?? s.line?.id
    if (!lid) continue
    if (!map.has(lid)) map.set(lid, { line: s.line })
    const g = map.get(lid)!
    const bucket = inferHistoryDisplayShift(s)
    const key = bucket === 'DAY' ? 'day' : 'night'
    const cur = g[key]
    if (!cur) g[key] = s
    else g[key] = pickBetterSession(cur, s, bucket)
    if (s.line) g.line = s.line
  }

  return Array.from(map.entries())
    .map(([lineId, { day, night, line }]) => ({
      lineId,
      line: line ?? day?.line ?? night?.line,
      day: day ?? null,
      night: night ?? null,
    }))
    .filter(item => item.line != null)
    .sort((a, b) => {
      const codeA = String(a.line?.lineCode ?? '')
      const codeB = String(b.line?.lineCode ?? '')
      return codeA.localeCompare(codeB, undefined, { numeric: true })
    })
}

function getUniqueParts(sess: any | null) {
  if (!sess) return []
  const records = Array.isArray(sess.hourlyRecords) ? sess.hourlyRecords : []
  const partMap = new Map()
  for (const r of records) {
    if (r.part && r.partId) partMap.set(r.partId, r.part)
  }
  return Array.from(partMap.values())
}

type OperatorPartLine = { partSamco: string; partName: string; qty: number }

type OperatorPartSummary = {
  operatorId: string
  displayName: string
  partLines: OperatorPartLine[]
}

/** ชื่อพนักงาน + Part ที่ขึ้นและจำนวน OK รวม (กะเช้า+ดึก) — ไม่แสดงรหัสพนักงาน */
function buildOperatorPartSummaries(day: any | null, night: any | null): OperatorPartSummary[] {
  type Acc = { displayName: string; partQty: Map<string, { part: any; qty: number }> }
  const byOp = new Map<string, Acc>()

  const displayNameFrom = (op: any) =>
    [op?.firstName, op?.lastName].filter(Boolean).join(' ').trim() || ''

  const touchOp = (id: string, op: any) => {
    const nm = displayNameFrom(op)
    const cur = byOp.get(id)
    if (!cur) {
      byOp.set(id, { displayName: nm || '—', partQty: new Map() })
      return
    }
    if (nm && (cur.displayName === '—' || !cur.displayName)) cur.displayName = nm
  }

  const bumpPart = (operatorId: string, r: any) => {
    if (!r?.partId || !r?.part) return
    const op = r.operator
    const nm = displayNameFrom(op)
    let acc = byOp.get(operatorId)
    if (!acc) {
      acc = { displayName: nm || '—', partQty: new Map() }
      byOp.set(operatorId, acc)
    } else if (nm && (acc.displayName === '—' || !acc.displayName)) {
      acc.displayName = nm
    }
    const add = Number(r.okQty) || 0
    const ex = acc.partQty.get(r.partId)
    if (ex) ex.qty += add
    else acc.partQty.set(r.partId, { part: r.part, qty: add })
  }

  for (const sess of [day, night]) {
    if (!sess) continue
    if (sess.operator?.id) touchOp(sess.operator.id, sess.operator)
    for (const r of sess.hourlyRecords ?? []) {
      const oid = r.operatorId ?? r.operator?.id
      if (!oid) continue
      if (r.operator) touchOp(oid, r.operator)
      bumpPart(oid, r)
    }
  }

  const rows: OperatorPartSummary[] = Array.from(byOp.entries()).map(([operatorId, acc]) => {
    const partLines: OperatorPartLine[] = Array.from(acc.partQty.values())
      .sort(
        (a, b) =>
          (Number(a.part?.partSamco) || 0) - (Number(b.part?.partSamco) || 0) ||
          String(a.part?.partName ?? '').localeCompare(String(b.part?.partName ?? ''), 'th'),
      )
      .map(({ part, qty }) => ({
        partSamco: String(part?.partSamco ?? ''),
        partName: String(part?.partName ?? '').trim(),
        qty,
      }))
    return { operatorId, displayName: acc.displayName, partLines }
  })

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'th', { numeric: true }))
  return rows
}

/** รวม Breakdown (นาที + จำนวนครั้ง) และ NG (ชิ้น) ต่อสาย วันนั้น */
function aggregateBreakdownNgForLineDay(day: any | null, night: any | null) {
  let bdMinutes = 0
  let bdCount = 0
  let ngQty = 0
  for (const sess of [day, night]) {
    if (!sess) continue
    for (const r of sess.hourlyRecords ?? []) {
      for (const bd of r.breakdownLogs ?? []) {
        bdMinutes += Number(bd.breakTimeMin) || 0
        bdCount += 1
      }
      for (const ng of r.ngLogs ?? []) {
        ngQty += Number(ng.ngQty) || 0
      }
    }
  }
  return { bdMinutes, bdCount, ngQty }
}

function sessionTotals(sess: any | null) {
  if (!sess) return { ok: 0, tgt: 0, avgPct: 0, avgPctNormal: 0, avgPctOt: 0, hasBd: false, hasNg: false }
  const records = Array.isArray(sess.hourlyRecords) ? sess.hourlyRecords : []
  const normalH = typeof sess.normalHours === 'number' ? sess.normalHours : 8

  const normalRecords = records.filter((r: any) => (Number(r.hourSlot) || 0) <= normalH)
  const otRecords     = records.filter((r: any) => (Number(r.hourSlot) || 0) > normalH)

  const calcAvg = (recs: any[]) => {
    const pcts = recs
      .map((r: any) => {
        const ok  = Number(r.okQty) || 0
        const tgt = Number(r.targetQty) || 0
        return tgt > 0 ? (ok / tgt) * 100 : 0
      })
      .filter((p: number) => p > 0)
    return pcts.length > 0 ? pcts.reduce((s: number, p: number) => s + p, 0) / pcts.length : 0
  }

  const avgPctNormal  = calcAvg(normalRecords)
  const avgPctOt      = calcAvg(otRecords)
  const allPcts       = [...normalRecords, ...otRecords]
  const avgPct        = calcAvg(allPcts)

  const ok  = records.reduce((n: number, r: any) => n + (Number(r.okQty) || 0), 0)
  const tgt = records.reduce((n: number, r: any) => n + (Number(r.targetQty) || 0), 0)

  return {
    ok,
    tgt,
    avgPct:       Math.round(avgPct),
    avgPctNormal: Math.round(avgPctNormal),
    avgPctOt:     Math.round(avgPctOt),
    hasBd: records.some((r: any) => r.hasBreakdown),
    hasNg: records.some((r: any) => r.hasNg),
  }
}

function ShiftHourGrid({
  sess,
  canEdit,
  onEdit,
  locale,
  keyPrefix,
}: {
  sess: any | null
  canEdit: boolean
  onEdit: (id: string) => void
  locale: string
  keyPrefix: string
}) {
  const shiftType = sess?.shiftType ?? (keyPrefix.includes('day') ? 'DAY' : 'NIGHT')
  const records   = sess ? (Array.isArray(sess.hourlyRecords) ? sess.hourlyRecords : []) : []
  const normalH   = sess ? (typeof sess.normalHours === 'number' ? sess.normalHours : 8) : 8
  const maxOtSlots = 3
  const startHour  = shiftType === 'DAY' ? 8 : 20
  const breakHour  = shiftType === 'DAY' ? 12 : 0

  function slotCell(slot: number, isOT: boolean) {
    const rec      = recordForHourSlot(records, slot)
    const hourTime = (startHour + slot - 1) % 24
    if (hourTime === breakHour) return null
    return (
      <HistorySlotCell
        key={`${keyPrefix}-${slot}`}
        slot={slot}
        hourTime={hourTime}
        isOT={isOT}
        rec={rec}
        canEdit={canEdit}
        onEdit={onEdit}
      />
    )
  }

  return (
    <div className="grid grid-cols-4 gap-1 sm:grid-cols-10">
      {Array.from({ length: normalH + maxOtSlots }, (_, i) => slotCell(i + 1, i >= normalH))}
    </div>
  )
}

function HistorySlotCell({
  slot,
  hourTime,
  isOT,
  rec,
  canEdit,
  onEdit,
}: {
  slot: number
  hourTime: number
  isOT: boolean
  rec: any | undefined
  canEdit: boolean
  onEdit: (id: string) => void
}) {
  const partSamco  = rec?.part?.partSamco
  const timeStr    = `${String(hourTime).padStart(2, '0')}:00`
  const okQty      = rec ? (Number(rec.okQty) || 0) : 0
  const targetQty  = rec ? (Number(rec.targetQty) || 0) : 0
  const percentage = targetQty > 0 ? Math.round((okQty / targetQty) * 100) : 0

  const inner = (
    <>
      <span className="font-bold leading-none text-[10px]">{timeStr}</span>
      {rec ? (
        <>
          <span className="font-mono mt-1 leading-none text-[11px]">{okQty}/{targetQty}</span>
          <span className={cn('font-bold text-[10px] leading-none',
            percentage >= 100 ? 'text-green-600' : percentage >= 80 ? 'text-yellow-600' : 'text-red-600'
          )}>
            {percentage}%
          </span>
          {partSamco != null && (
            <span className="mt-0.5 max-w-full truncate text-[9px] font-medium leading-tight text-slate-500" title={String(partSamco)}>
              {partSamco}
            </span>
          )}
        </>
      ) : (
        <span className="mt-1 text-slate-300 leading-none">—</span>
      )}
      {rec?.hasBreakdown && <Wrench size={10} className="mt-0.5 text-red-400 shrink-0" />}
    </>
  )

  const cls = cn(
    'rounded-lg p-2 text-center text-xs border min-h-[3.25rem] flex flex-col items-center justify-center',
    partSamco != null && 'min-h-[4rem]',
    rec
      ? (isOT ? 'bg-green-100 border-green-400 text-green-700' : 'slot-recorded')
      : (isOT ? 'bg-orange-100 border-orange-300 text-orange-600' : 'bg-red-100 border-red-300 text-red-600'),
    rec?.id && canEdit && 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1',
  )

  if (rec?.id && canEdit) {
    return (
      <button type="button" className={cn(cls, 'w-full')} onClick={() => onEdit(rec.id)}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

interface Props {
  initialSessions: any[]
  lines: LineRow[]
  defaultDate: string
  userRole?: string
}

export function HistoryClient({ initialSessions, lines, defaultDate, userRole }: Props) {
  const { t, locale }   = useI18n()
  const [sessions, setSessions]         = useState(initialSessions)
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [lineFilter, setLineFilter]     = useState('')
  const [filterDivisionId, setFilterDivisionId] = useState('')
  const [filterSectionId, setFilterSectionId] = useState('')
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  /** รายละเอียดรายชั่วโมง (พนักงาน / สรุป Part / กริด) — ยุบเป็นค่าเริ่มต้น */
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(() => new Set())

  const toggleLineDetail = useCallback((id: string) => {
    setExpandedLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const canEditRecord = !!(userRole && EDIT_ROLES.has(userRole))

  const divisionOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lines) {
      const d = l.section?.division
      if (!d?.id) continue
      const name = canonicalDivisionName(d.divisionName) ?? d.divisionName ?? d.divisionCode ?? d.id
      m.set(d.id, name)
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [lines])

  const sectionOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lines) {
      const s = l.section
      const d = s?.division
      if (!s?.id || !d?.id) continue
      if (filterDivisionId && d.id !== filterDivisionId) continue
      const label = [s.sectionCode, s.sectionName].filter(Boolean).join(' — ')
      m.set(s.id, label || s.id)
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'th'))
  }, [lines, filterDivisionId])

  useEffect(() => {
    if (!filterSectionId) return
    if (!sectionOptions.some(o => o.id === filterSectionId)) {
      setFilterSectionId('')
    }
  }, [filterSectionId, sectionOptions])

  /** สายที่อยู่ในฝ่าย + Section ที่เลือก — ใช้เติม dropdown สายการผลิตให้สอดคล้อง */
  const linesMatchingOrgFilters = useMemo(() => {
    return lines.filter(l => {
      if (filterDivisionId && l.section?.division?.id !== filterDivisionId) return false
      if (filterSectionId && l.section?.id !== filterSectionId) return false
      return true
    })
  }, [lines, filterDivisionId, filterSectionId])

  useEffect(() => {
    if (!lineFilter) return
    if (!linesMatchingOrgFilters.some(l => l.id === lineFilter)) {
      setLineFilter('')
    }
  }, [lineFilter, linesMatchingOrgFilters])

  const reloadSessions = useCallback(() => {
    const q = new URLSearchParams({ date: selectedDate, detailed: '1' })
    if (lineFilter) q.set('lineId', lineFilter)
    return fetch(`/api/production/sessions?${q.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          if (r.status !== 403 && r.status !== 401 && j.error) {
            toast.error(typeof j.error === 'string' ? j.error : 'Load failed')
          }
          return
        }
        setSessions(Array.isArray(j.data) ? j.data : [])
      })
      .catch(() => toast.error(locale === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load'))
  }, [selectedDate, lineFilter, locale])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    reloadSessions().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadSessions])

  // กรอง Lines ตามฝ่าย / Section / สาย / search (lineCode / lineName / section / ชื่อฝ่าย / แผนก)
  const searchNorm = normalizeLine(search.trim())
  const filteredLines = lines.filter(l => {
    if (lineFilter && l.id !== lineFilter) return false
    if (filterDivisionId && l.section?.division?.id !== filterDivisionId) return false
    if (filterSectionId && l.section?.id !== filterSectionId) return false
    if (!searchNorm) return true
    const divName =
      canonicalDivisionName(l.section?.division?.divisionName) ?? l.section?.division?.divisionName ?? ''
    const hay = normalizeLine(
      `${l.lineCode} ${l.lineName ?? ''} ${l.section?.sectionName ?? ''} ${l.section?.sectionCode ?? ''} ${divName} ${l.section?.division?.department?.departmentName ?? ''}`
    )
    return hay.includes(searchNorm)
  })

  // Sessions ที่อยู่ใน filteredLines
  const filteredSessions = sessions.filter(s => {
    const lid = s.lineId ?? s.line?.id
    return filteredLines.some(l => l.id === lid)
  })

  const groupedLines = groupSessionsByLine(filteredSessions, filteredLines)

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      IN_PROGRESS: 'bg-blue-100 text-blue-700',
      COMPLETED:   'bg-green-100 text-green-700',
      CANCELLED:   'bg-slate-100 text-slate-500',
    }
    const label: Record<string, string> = {
      IN_PROGRESS: locale === 'th' ? 'กำลังผลิต' : 'In Progress',
      COMPLETED:   locale === 'th' ? 'เสร็จสิ้น' : 'Completed',
      CANCELLED:   locale === 'th' ? 'ยกเลิก' : 'Cancelled',
    }
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>{label[status] ?? status}</span>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('productionHistory')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {locale === 'th'
            ? 'แสดงประวัติการผลิตตามสายการผลิต — คลิกลูกศรหน้าชื่อสายเพื่อขยายดูรายละเอียดรายชั่วโมง (ค่าเริ่มต้นยุบไว้)'
            : 'Production history by line — click the chevron next to the line to expand hourly details (collapsed by default).'}
        </p>
        {canEditRecord ? (
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'th'
              ? 'หัวหน้างาน / วิศวกร / ผู้จัดการ / Admin: ขยายรายละเอียดสายก่อน แล้วคลิกช่องรายชั่วโมงเพื่อแก้ไข Part, OK, Breakdown, NG และหมายเหตุ'
              : 'Supervisor / Engineer / Manager / Admin: expand a line first, then click an hourly cell to edit part, OK, breakdown, NG, and remark.'}
          </p>
        ) : (
          <p className="text-xs text-amber-700/90 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2 inline-block">
            {locale === 'th'
              ? 'แก้ไขย้อนหลัง: ให้หัวหน้างานขึ้นไปเปิดหน้านี้ ขยายสาย แล้วคลิกช่องรายชั่วโมง — หรือแจ้ง Admin'
              : 'To correct data, ask Supervisor+ to open this page, expand the line, then click an hourly cell, or contact Admin.'}
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[160px]">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <CalendarDays size={14} className="text-slate-400" />
            {locale === 'th' ? 'วันที่' : 'Date'}
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Layers size={14} className="text-slate-400" />
            {locale === 'th' ? 'ชื่อฝ่าย' : 'Division'}
          </label>
          <select
            value={filterDivisionId}
            onChange={e => {
              setFilterDivisionId(e.target.value)
              setFilterSectionId('')
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">{locale === 'th' ? 'ทุกฝ่าย' : 'All divisions'}</option>
            {divisionOptions.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <LayoutList size={14} className="text-slate-400" />
            Section
          </label>
          <select
            value={filterSectionId}
            onChange={e => setFilterSectionId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">{locale === 'th' ? 'ทุก Section' : 'All sections'}</option>
            {sectionOptions.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Factory size={14} className="text-slate-400" />
            {locale === 'th' ? 'สายการผลิต' : 'Line'}
          </label>
          <select
            value={lineFilter}
            onChange={e => setLineFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">{locale === 'th' ? 'ทุกสาย (ในที่เลือก)' : 'All lines (in scope)'}</option>
            {linesMatchingOrgFilters.map(l => {
              const deptName = l.section?.division?.department?.departmentName
              const secName  = l.section?.sectionName
              const suffix   = [deptName, secName].filter(Boolean).join(' / ')
              return (
                <option key={l.id} value={l.id}>
                  {l.lineCode}{l.lineName ? ` — ${l.lineName}` : ''}{suffix ? ` (${suffix})` : ''}
                </option>
              )
            })}
          </select>
        </div>
        <div className="relative min-w-[200px] flex-1">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Search size={14} className="text-slate-400" />
            {locale === 'th' ? 'ค้นหา (สาย / ฝ่าย / Section / แผนก)' : 'Search (line / division / section / dept)'}
          </label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={locale === 'th' ? 'รหัสสาย / ฝ่าย / Section...' : 'Line / division / section...'}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 sm:pb-2">
            <Loader2 size={16} className="animate-spin" />
            {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
          </div>
        )}
      </div>

      {/* Table */}
      {groupedLines.length === 0 && !loading ? (
        <div className="rounded-xl bg-white border border-slate-100 py-16 text-center text-sm text-slate-400">
          {t('noData')}
        </div>
      ) : (
        <div className={cn('overflow-x-auto rounded-lg shadow-sm', loading && 'opacity-60 pointer-events-none')}>
          <table className="w-full border-separate border-spacing-0 bg-white">
            <thead>
              <tr>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'สายการผลิต' : 'Line'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'ชิ้นงาน' : 'Part'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'รวมทั้งวัน' : 'Total'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'กะเช้า' : 'Day'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'OT เช้า' : 'Day OT'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'กะดึก' : 'Night'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'OT ดึก' : 'Night OT'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>{locale === 'th' ? 'สรุป Breakdown' : 'Breakdown'}</th>
                <th className={HISTORY_MAIN_HEAD_TH}>NG</th>
              </tr>
            </thead>
            <tbody>
              {groupedLines.map(({ lineId, line, day, night }) => {
                const dTot    = sessionTotals(day)
                const nTot    = sessionTotals(night)
                const sumOk   = dTot.ok + nTot.ok
                const sumTgt  = dTot.tgt + nTot.tgt
                const avgPctAllNormal = dTot.avgPctNormal > 0 && nTot.avgPctNormal > 0
                  ? Math.round((dTot.avgPctNormal + nTot.avgPctNormal) / 2)
                  : dTot.avgPctNormal > 0 ? dTot.avgPctNormal : nTot.avgPctNormal
                const rawDate  = day?.sessionDate ?? night?.sessionDate

                const dayParts   = getUniqueParts(day)
                const nightParts = getUniqueParts(night)
                const allParts   = [...dayParts, ...nightParts].filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
                const operatorPartSummaries = buildOperatorPartSummaries(day, night)
                const bdNg = aggregateBreakdownNgForLineDay(day, night)

                // Org info
                const section    = line?.section
                const department = section?.division?.department
                const deptName   = department?.departmentName ?? department?.departmentCode ?? null
                const secName    = section?.sectionName ?? section?.sectionCode ?? null

                const lineDetailOpen = expandedLineIds.has(lineId)

                return (
                  <React.Fragment key={lineId}>
                    {/* Main row */}
                    <tr className="hover:bg-slate-50 border-b border-slate-200">
                      {/* Column: สายการผลิต */}
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleLineDetail(lineId)}
                            className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-900"
                            aria-expanded={lineDetailOpen}
                            aria-label={
                              locale === 'th'
                                ? lineDetailOpen
                                  ? 'ยุบรายละเอียดรายชั่วโมง'
                                  : 'ขยายรายละเอียดรายชั่วโมง'
                                : lineDetailOpen
                                  ? 'Collapse hourly details'
                                  : 'Expand hourly details'
                            }
                            title={
                              locale === 'th'
                                ? lineDetailOpen
                                  ? 'ยุบรายละเอียดรายชั่วโมง'
                                  : 'ขยายรายละเอียดรายชั่วโมง'
                                : lineDetailOpen
                                  ? 'Collapse hourly details'
                                  : 'Expand hourly details'
                            }
                          >
                            <ChevronDown
                              className={cn('h-4 w-4 transition-transform duration-200', lineDetailOpen ? 'rotate-0' : '-rotate-90')}
                              aria-hidden
                            />
                          </button>
                          <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm">{line?.lineCode ?? '—'}</span>
                            {line?.lineName && (
                              <span className="text-xs text-slate-500">{line.lineName}</span>
                            )}
                          </div>
                          {(deptName || secName) && (
                            <div className="flex flex-wrap gap-1">
                              {deptName && (
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                  {deptName}
                                </span>
                              )}
                              {secName && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {secName}
                                </span>
                              )}
                            </div>
                          )}
                          {rawDate && (
                            <p className="text-[10px] text-slate-400">
                              {formatUtcCalendarDate(new Date(rawDate), locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB')}
                            </p>
                          )}
                          </div>
                        </div>
                      </td>
                      {/* Column: ชิ้นงาน */}
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="space-y-1">
                          {allParts.length > 0 ? allParts.map(part => (
                            <div key={part.id} className="text-xs">
                              <span className="font-mono font-medium">{part.partSamco}</span>
                              {part.partName && <span className="text-slate-500 ml-1">— {part.partName}</span>}
                            </div>
                          )) : <span className="text-slate-400 text-xs">—</span>}
                        </div>
                      </td>
                      {/* Column: รวมทั้งวัน */}
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-mono font-bold text-sm text-slate-800">{sumOk.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400">/ {sumTgt.toLocaleString()}</p>
                          </div>
                          <span className={cn('font-bold text-sm',
                            avgPctAllNormal >= 100 ? 'text-green-600' : avgPctAllNormal >= 85 ? 'text-yellow-500' : 'text-red-500'
                          )}>
                            {avgPctAllNormal}%
                          </span>
                          <div className="flex items-center gap-1">
                            {(dTot.hasBd || nTot.hasBd) && <Wrench size={14} className="text-red-400" />}
                            {(dTot.hasNg || nTot.hasNg) && <XCircle size={14} className="text-orange-400" />}
                          </div>
                        </div>
                      </td>
                      {/* Column: กะเช้า */}
                      <td className="border border-slate-200 px-3 py-2">
                        {day ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{dTot.ok.toLocaleString()}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-slate-400">{dTot.tgt.toLocaleString()}</span>
                            <span className={cn('font-medium', dTot.avgPctNormal >= 100 ? 'text-green-600' : 'text-slate-500')}>
                              ({dTot.avgPctNormal}%)
                            </span>
                          </div>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      {/* Column: OT เช้า */}
                      <td className="border border-slate-200 px-3 py-2 text-center">
                        {dTot.avgPctOt > 0 ? (
                          <span className={cn('text-xs font-medium', dTot.avgPctOt >= 100 ? 'text-green-600' : 'text-orange-600')}>
                            {dTot.avgPctOt}%
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      {/* Column: กะดึก */}
                      <td className="border border-slate-200 px-3 py-2">
                        {night ? (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{nTot.ok.toLocaleString()}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-slate-400">{nTot.tgt.toLocaleString()}</span>
                            <span className={cn('font-medium', nTot.avgPctNormal >= 100 ? 'text-green-600' : 'text-slate-500')}>
                              ({nTot.avgPctNormal}%)
                            </span>
                          </div>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      {/* Column: OT ดึก */}
                      <td className="border border-slate-200 px-3 py-2 text-center">
                        {nTot.avgPctOt > 0 ? (
                          <span className={cn('text-xs font-medium', nTot.avgPctOt >= 100 ? 'text-green-600' : 'text-orange-600')}>
                            {nTot.avgPctOt}%
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      {/* Column: สรุป Breakdown */}
                      <td className="border border-slate-200 px-3 py-2 text-xs">
                        {bdNg.bdCount > 0 || bdNg.bdMinutes > 0 ? (
                          <div className="space-y-0.5">
                            <p className="font-mono font-semibold text-red-700">
                              {bdNg.bdMinutes.toLocaleString()}
                              {locale === 'th' ? ' นาที' : ' min'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {bdNg.bdCount.toLocaleString()}
                              {locale === 'th' ? ' ครั้ง' : ' events'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {/* Column: NG */}
                      <td className="border border-slate-200 px-3 py-2 text-xs">
                        {bdNg.ngQty > 0 ? (
                          <span className="font-mono font-semibold text-orange-700">
                            {bdNg.ngQty.toLocaleString()}
                            <span className="ml-0.5 text-[10px] font-normal text-slate-500">
                              {locale === 'th' ? 'ชิ้น' : 'pcs'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Detail row — รายชั่วโมง (ขยายเมื่อคลิกลูกศร) */}
                    {lineDetailOpen ? (
                    <tr>
                      <td colSpan={9} className="border-x border-slate-200 bg-white p-0">
                        <div className="grid grid-cols-12 border-b border-slate-200">
                          {/* Info panel */}
                          <div className="col-span-2 border-r border-slate-200 p-3 bg-slate-50/50">
                            <div className="text-[11px]">
                              <div className="text-slate-600 mb-1">
                                {locale === 'th' ? 'พนักงานที่บันทึก (วันนี้)' : 'Operators (today)'}
                                {operatorPartSummaries.length > 0 && (
                                  <span className="text-slate-500 font-normal">
                                    {' '}
                                    ({operatorPartSummaries.length}{' '}
                                    {locale === 'th' ? 'คน' : 'total'})
                                  </span>
                                )}
                              </div>
                              {operatorPartSummaries.length > 0 ? (
                                <div className="max-h-56 overflow-y-auto space-y-2">
                                  {operatorPartSummaries.map(row => (
                                    <div key={row.operatorId}>
                                      <div className="font-medium text-slate-800 leading-snug">
                                        {row.displayName}
                                      </div>
                                      {row.partLines.length > 0 ? (
                                        <ul className="mt-0.5 list-none m-0 space-y-0.5 border-l border-slate-200 pl-2">
                                          {row.partLines.map((pl, idx) => (
                                            <li
                                              key={`${row.operatorId}-${pl.partSamco}-${idx}`}
                                              className="text-[10px] leading-relaxed text-slate-600"
                                            >
                                              <span className="font-mono font-medium text-slate-700">
                                                {pl.partSamco}
                                              </span>
                                              {pl.partName ? (
                                                <span className="text-slate-500"> — {pl.partName}</span>
                                              ) : null}
                                              <span className="text-slate-800 font-semibold ml-1">
                                                {pl.qty.toLocaleString()}{' '}
                                                {locale === 'th' ? 'ชิ้น' : 'pcs'}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-0.5 text-[10px] text-slate-400 pl-2 border-l border-transparent">
                                          {locale === 'th' ? 'ยังไม่มีบันทึกรายชั่วโมง' : 'No hourly records yet'}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </div>

                          {/* Part summary */}
                          <div className="col-span-2 border-r border-slate-200 p-3">
                            <div className="text-xs font-semibold text-slate-700 mb-2">
                              {locale === 'th' ? 'สรุปรวมชิ้นงาน' : 'Part Summary'}
                            </div>
                            <table className="w-full text-[10px] border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="text-left py-1 font-medium text-slate-600">Part</th>
                                  <th className="text-right py-1 font-medium text-slate-600">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const combinedRecords = [
                                    ...(day?.hourlyRecords ?? []),
                                    ...(night?.hourlyRecords ?? []),
                                  ]
                                  const partMap = new Map<string, { part: any; qty: number }>()
                                  for (const r of combinedRecords) {
                                    if (r.part && r.partId) {
                                      const ex = partMap.get(r.partId)
                                      if (ex) ex.qty += Number(r.okQty) || 0
                                      else partMap.set(r.partId, { part: r.part, qty: Number(r.okQty) || 0 })
                                    }
                                  }
                                  return Array.from(partMap.values()).map(({ part, qty }) => (
                                    <tr key={part.id} className="border-b border-slate-100">
                                      <td className="py-1 font-mono">{part.partSamco}</td>
                                      <td className="py-1 text-right font-mono font-medium">{qty.toLocaleString()}</td>
                                    </tr>
                                  ))
                                })()}
                              </tbody>
                            </table>
                          </div>

                          {/* Hour grids */}
                          <div className="col-span-8 p-3">
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700">
                                    {locale === 'th' ? 'กะเช้า' : 'Day Shift'}
                                  </span>
                                  {day && (
                                    <div className="flex items-center gap-2 text-xs">
                                      {statusBadge(day.status)}
                                      {day.operator && (
                                        <span className="text-slate-500">
                                          {`${day.operator.firstName ?? ''} ${day.operator.lastName ?? ''}`.trim()}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <ShiftHourGrid
                                  sess={day}
                                  canEdit={canEditRecord}
                                  onEdit={setEditingId}
                                  locale={locale}
                                  keyPrefix={`${lineId}-day`}
                                />
                              </div>
                              <div className="border-t border-slate-200 pt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700">
                                    {locale === 'th' ? 'กะดึก' : 'Night Shift'}
                                  </span>
                                  {night && (
                                    <div className="flex items-center gap-2 text-xs">
                                      {statusBadge(night.status)}
                                      {night.operator && (
                                        <span className="text-slate-500">
                                          {`${night.operator.firstName ?? ''} ${night.operator.lastName ?? ''}`.trim()}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <ShiftHourGrid
                                  sess={night}
                                  canEdit={canEditRecord}
                                  onEdit={setEditingId}
                                  locale={locale}
                                  keyPrefix={`${lineId}-night`}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <HistoryHourlyEditDialog
        open={!!editingId}
        recordId={editingId}
        onOpenChange={open => {
          if (!open) setEditingId(null)
        }}
        locale={locale}
        onSaved={async () => {
          await reloadSessions()
        }}
      />
    </div>
  )
}
