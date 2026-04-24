'use client'

import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { SHIFT_CONFIGS, getCurrentShift, getCurrentHourSlot, getSlotStartTime } from '@/lib/utils/shift'
import {
  getThaiIsoDateTimeLocal,
  getThaiTodayUTC,
  getThaiReportingDateUTC,
  formatThaiDateUTCISO,
  parseThaiCalendarDateUtc,
  formatInstantBangkok,
} from '@/lib/time-utils'
import { buildBreakdownIntervalsFromSlotMinutes } from '@/lib/utils/breakdown-datetime'
import { Plus, Minus, Factory, Clock, CheckCircle2, XCircle, Wrench, Loader2, Coffee, Search, User, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const createSchema = (t: ReturnType<typeof useI18n>['t']) => z.object({
  partId:    z.string().min(1, t('recordSelectPart')),
  hourSlot:  z.number().int().min(1).max(11),
  okQty:     z.number().int().min(0),
  remark:    z.string().optional(),
  hasBreakdown: z.boolean().default(false),
  hasNg:        z.boolean().default(false),
  breakdown: z.array(z.object({
    machineId:         z.string().min(1, t('machine')),
    /** นาทีเท่านั้น — ระบบสร้างช่วงเวลาจากต้นชั่วโมงของ slot (รวมทุกแถวไม่เกิน 60 นาที/ชม.) */
    breakTimeMin:      z.coerce.number().int().min(1).max(60),
    problemCategoryId: z.string().min(1, t('recordSelectCause')),
    problemDetail:     z.string().optional(),
  })).optional(),
  ng: z.array(z.object({
    /** ว่างได้ — ระบบเติมจากเครื่องเดียวในไลน์หรือ machine ของ Session */
    machineId:         z.string().optional(),
    ngQty:             z.coerce.number().int().min(1),
    problemCategoryId: z.string().min(1, t('recordNgCause')),
    problemDetail:     z.string().optional(),
  })).optional(),
})

type FormData = z.infer<ReturnType<typeof createSchema>>
type SessionGuardWarning = {
  code: string
  message: string
  mode: 'warn' | 'enforce'
  lineId: string
  lineCode: string
  lineName: string
  activeLineTargetCount: number
  overrideApplied: boolean
  overrideReason?: string | null
}


const LINE_LIST_MAX_HEIGHT = 'min(calc(2.75rem * 20), min(55vh, 70dvh))' as const

function defaultMachineIdOnLine(machinesOnLine: { id: string }[], sessionMachineId: string | null | undefined): string {
  if (machinesOnLine.length === 1) return String(machinesOnLine[0]!.id)
  const sid = sessionMachineId?.trim()
  if (sid && machinesOnLine.some((m) => m.id === sid)) return sid
  return ''
}

type LineActivitySnapshot = {
  hourSlot: number
  okQty: number
  partSamco: number | null
  recordTime: string
}

/** สีตามระยะห่างของชั่วโมงที่บันทึกล่าสุด กับชั่วโมงปัจจุบัน (liveSlot): เท่ากัน=เขียว, ย้อน 1 ชม.=เหลือง, นอกนั้น=แดง */
function lineActivityBadgeClass(recordedSlot: number, currentSlot: number): string {
  const d = currentSlot - recordedSlot
  if (d === 0) return 'bg-green-100 text-green-700'
  if (d === 1) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-700'
}

function getLineActivityMeta(
  snap: LineActivitySnapshot | undefined | null,
  noDataLabel: string,
  shiftType: 'DAY' | 'NIGHT',
  currentHourSlot: number,
) {
  if (!snap) {
    return {
      slotLabel: noDataLabel,
      recordedAtShort: '',
      partLabel: '-',
      qtyLabel: '-',
      badgeClass: 'bg-slate-100 text-slate-500',
    }
  }

  let recordedAtShort = ''
  try {
    const d = new Date(snap.recordTime)
    if (!Number.isNaN(d.getTime())) {
      recordedAtShort = formatInstantBangkok(d, {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    }
  } catch {
    /* ignore */
  }

  return {
    slotLabel: getSlotStartTime(shiftType, snap.hourSlot),
    recordedAtShort,
    partLabel: snap.partSamco != null ? String(snap.partSamco) : '-',
    qtyLabel: typeof snap.okQty === 'number' ? snap.okQty.toLocaleString() : '-',
    badgeClass: lineActivityBadgeClass(snap.hourSlot, currentHourSlot),
  }
}

/** บันทึกที่แก้ล่าสุดใน session — สอดคล้อง order updatedAt desc บน server / API line-activity */
function latestSnapshotFromHourlyRecords(records: any[]): LineActivitySnapshot | null {
  if (!Array.isArray(records) || records.length === 0) return null
  let best = records[0]!
  const tBest = (r: any) => new Date(r.updatedAt ?? r.createdAt ?? r.recordTime ?? 0).getTime()
  for (const r of records) {
    const tb = tBest(best)
    const tr = tBest(r)
    if (tr > tb) best = r
    else if (tr === tb && (Number(r.hourSlot) || 0) > (Number(best.hourSlot) || 0)) best = r
  }
  const rt = best.recordTime != null ? new Date(best.recordTime).toISOString() : new Date().toISOString()
  return {
    hourSlot: Number(best.hourSlot) || 0,
    okQty: Number(best.okQty) || 0,
    partSamco: best.part?.partSamco ?? null,
    recordTime: rt,
  }
}
interface Props {
  machines: any[]
  problemCategories: any[]
  existingSession: any
  /** จำกัดเฉพาะเครื่องในสายนี้ (มาจาก ?lineId= หรือ QR สาย) */
  lockedLine?: { id: string; lineCode: string; lineName: string } | null
  /** ต้องกรอกรหัสพนักงานก่อน (ไม่มี NextAuth และยังไม่มี cookie สแกน — ทั้ง QR สายและ QR เครื่อง) */
  requiresScanPin?: boolean
  /** เลือกสายเริ่มต้น (จาก QR ไลน์ หรือแมปจาก QR เครื่อง) */
  initialLineId?: string
  defaultPartId?: string
  operatorId?: string
  lines: any[]
  /** เป้า LinePartTarget ต่อ lineId — ใช้เลือก Part / แสดงเป้า (ไม่ใช้ MachinePartTarget) */
  linePartTargetsByLine?: Record<string, any[]>
  /** บันทึกล่าสุดต่อสาย (กะ+วัน) — แสดงในรายการเลือกสาย */
  lineActivityByLineId?: Record<string, LineActivitySnapshot>
  /** Section สำหรับกรองรายการสาย (ไม่แสดงเมื่อ lockedLine จาก QR) */
  sections?: { id: string; sectionCode: string; sectionName: string; division?: { divisionCode: string; divisionName: string } }[]
}

/** สายที่ไม่มี sectionId — ค่า sentinel ใน select */
const SECTION_UNASSIGNED = '__unassigned__' as const

function getInitialSectionId(
  lines: any[],
  lockedLine: Props['lockedLine'],
  initialLineId: string | undefined,
): string {
  if (lockedLine) return ''
  const lid = initialLineId ?? ''
  if (!lid) return ''
  const ln = lines.find((x: any) => x.id === lid)
  if (!ln) return ''
  if (ln.sectionId) return ln.sectionId as string
  return lines.some((l: any) => !l.sectionId) ? SECTION_UNASSIGNED : ''
}




















export function RecordClient({
  machines,
  problemCategories,
  existingSession: initialSession,
  lockedLine = null,
  requiresScanPin = false,
  initialLineId,
  defaultPartId,
  operatorId,
  lines,
  linePartTargetsByLine = {},
  lineActivityByLineId = {},
  sections = [],
}: Props) {
  const router = useRouter()
  const { t, locale, setLocale } = useI18n()

  const localeToggleMobile = (
    <div
      className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-sm md:hidden"
      role="group"
      aria-label={locale === 'th' ? 'สลับภาษา' : 'Switch language'}
    >
      <button
        type="button"
        aria-pressed={locale === 'th'}
        onClick={() => setLocale('th')}
        className={cn(
          'rounded-md px-2.5 py-1.5 transition-colors',
          locale === 'th' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50',
        )}
      >
        TH
      </button>
      <button
        type="button"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
        className={cn(
          'rounded-md px-2.5 py-1.5 transition-colors',
          locale === 'en' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50',
        )}
      >
        EN
      </button>
    </div>
  )

  const [liveShift, setLiveShift] = useState<'DAY' | 'NIGHT'>(() => getCurrentShift())
  const [liveSlot,  setLiveSlot]  = useState<number>(() => getCurrentHourSlot(getCurrentShift()))

  /** บันทึกล่าสุดต่อสาย — รีเฟรชจาก API แทน props SSR ที่ค้าง */
  const [lineActivityMap, setLineActivityMap] = useState<Record<string, LineActivitySnapshot>>(() => ({
    ...(lineActivityByLineId ?? {}),
  }))
  const lastSyncedLineActivityJson = useRef<string>('')

  const refreshLineActivityMap = useCallback(async () => {
    if (requiresScanPin) return
    try {
      const res = await fetch('/api/production/line-activity')
      if (!res.ok) return
      const j = await res.json()
      if (j?.data && typeof j.data === 'object') {
        setLineActivityMap(j.data as Record<string, LineActivitySnapshot>)
      }
    } catch {
      /* ignore */
    }
  }, [requiresScanPin])

  useEffect(() => {
    const j = JSON.stringify(lineActivityByLineId ?? {})
    if (j === lastSyncedLineActivityJson.current) return
    lastSyncedLineActivityJson.current = j
    try {
      setLineActivityMap(JSON.parse(j) as Record<string, LineActivitySnapshot>)
    } catch {
      setLineActivityMap({ ...(lineActivityByLineId ?? {}) })
    }
  }, [lineActivityByLineId])

  useEffect(() => {
    const tick = () => {
      const shift = getCurrentShift()
      const slot = getCurrentHourSlot(shift)
      setLiveShift(shift)
      setLiveSlot(slot)
      if (!requiresScanPin) void refreshLineActivityMap()
    }
    void refreshLineActivityMap()
    const timer = setInterval(tick, 15_000)
    return () => clearInterval(timer)
  }, [requiresScanPin, refreshLineActivityMap])

  const shiftConfig = SHIFT_CONFIGS[liveShift]
  const minSlot     = Math.max(1, liveSlot - 1)

  const [selectedTarget, setSelectedTarget]   = useState<any>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [sessionData, setSessionData] = useState<any>(initialSession)
  const [creatingSession, setCreatingSession] = useState(false)
  const [sessionGuardWarning, setSessionGuardWarning] = useState<SessionGuardWarning | null>(null)
  /** อีกกะหนึ่ง (DAY/NIGHT) ยัง IN_PROGRESS บน sessionDate เดียวกัน — บังคับปิดก่อนบันทึก */
  const [siblingShiftOpen, setSiblingShiftOpen] = useState<{ id: string; shiftType: 'DAY' | 'NIGHT' } | null>(null)
  /** สายที่เลือก (หรือ locked จาก QR) */
  const [selectedLineId, setSelectedLineId] = useState<string>(() => lockedLine?.id ?? initialLineId ?? '')

  const machinesOnLine = useMemo(() => {
    const lid = lockedLine ? lockedLine.id : selectedLineId
    if (!lid) return []
    return machines.filter(m => (m.lineId ?? m.line?.id) === lid)
  }, [machines, lockedLine, selectedLineId])

  const schema = useMemo(() => {
    return createSchema(t).superRefine((val, ctx) => {
      const rows = val.ng ?? []
      const hasNgRows = rows.length > 0
      if (!val.hasNg && !hasNgRows) return
      if (hasNgRows === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('recordNgAddAtLeastOne'),
          path: ['ng'],
        })
        return
      }
      const defaultMid = defaultMachineIdOnLine(machinesOnLine, sessionData?.machineId)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!
        const mid = (row.machineId ?? '').trim() || defaultMid
        if (!mid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('machine'),
            path: ['ng', i, 'machineId'],
          })
        }
      }
    })
  }, [t, machinesOnLine, sessionData?.machineId])

  const [lineSearch, setLineSearch] = useState('')
  const [partSearch, setPartSearch] = useState('')
  const [linePanelOpen, setLinePanelOpen] = useState(false)
  const [partPanelOpen, setPartPanelOpen] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState(() =>
    getInitialSectionId(lines, lockedLine, initialLineId),
  )

  const hasUnassignedLines = useMemo(
    () => lines.some((l: any) => !l.sectionId),
    [lines],
  )
  const [pinGateLoading, setPinGateLoading] = useState(false)
  const [pinGateError, setPinGateError] = useState('')
  const linePickerRef = useRef<HTMLDivElement>(null)
  const lineSearchInputRef = useRef<HTMLInputElement>(null)
  const partPickerRef = useRef<HTMLDivElement>(null)
  const partSearchInputRef = useRef<HTMLInputElement>(null)
  const existingSessionRef = useRef<any>(initialSession)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      partId: defaultPartId ?? '',
      hourSlot: liveSlot,
      hasBreakdown: false,
      hasNg: false,
    },
  })

  const { fields: bdFields, append: appendBd, remove: removeBd, replace: replaceBd } = useFieldArray({ control, name: 'breakdown' })
  const { fields: ngFields, append: appendNg, remove: removeNg, replace: replaceNg } = useFieldArray({ control, name: 'ng' })

  const watchPartId       = watch('partId')
  const watchHourSlot     = watch('hourSlot')
  const watchHasBreakdown = watch('hasBreakdown')
  const watchHasNg        = watch('hasNg')
  const watchBreakdown    = watch('breakdown')

  const recordDateIso = useMemo(() => {
    if (sessionData?.sessionDate) {
      const sessionDate = new Date(sessionData.sessionDate)
      if (!Number.isNaN(sessionDate.getTime())) {
        return formatThaiDateUTCISO(sessionDate)
      }
    }
    return formatThaiDateUTCISO(getThaiTodayUTC())
  }, [sessionData?.sessionDate])

  /** รวม snapshot จาก API + ทับด้วย session ปัจจุบัน (หลังบันทึก / โหลด session ล่าสุด) */
  const displayLineActivityByLineId = useMemo(() => {
    const base = { ...lineActivityMap }
    if (sessionData?.lineId && Array.isArray(sessionData.hourlyRecords) && sessionData.hourlyRecords.length > 0) {
      const snap = latestSnapshotFromHourlyRecords(sessionData.hourlyRecords)
      if (snap) base[sessionData.lineId] = snap
    }
    return base
  }, [lineActivityMap, sessionData])


  const recordedMap = useMemo(() => {
    const map: Record<number, { okQty: number; hasBreakdown: boolean; hasNg: boolean }> = {}
    if (!watchPartId) return map
    const records: any[] = sessionData?.hourlyRecords ?? []
    records
      .filter((r: any) => r.partId === watchPartId)
      .forEach((r: any) => {
        map[r.hourSlot] = { okQty: r.okQty, hasBreakdown: r.hasBreakdown, hasNg: r.hasNg }
      })
    return map
  }, [sessionData, watchPartId])

  const slotByHourAllParts = useMemo(() => {
    const m: Record<
      number,
      { okQty: number; partId: string; partSamco: number | null; hasBreakdown: boolean; hasNg: boolean }
    > = {}
    const records: any[] = sessionData?.hourlyRecords ?? []
    for (const r of records) {
      m[Number(r.hourSlot)] = {
        okQty: r.okQty,
        partId: r.partId,
        partSamco: r.part?.partSamco ?? null,
        hasBreakdown: !!r.hasBreakdown,
        hasNg: !!r.hasNg,
      }
    }
    return m
  }, [sessionData])

  /** Slot ที่ยังไม่ได้บันทึก (ทุก Part) ภายในช่วงที่อนุญาต */
  const nextEmptySlot = useMemo(() => {
    for (let s = minSlot; s <= liveSlot; s++) {
      if (!slotByHourAllParts[s]) return s
    }
    return null
  }, [minSlot, liveSlot, slotByHourAllParts])

  /** Record ที่มีอยู่แล้วสำหรับ slot ที่เลือกอยู่ */
  const selectedSlotRec = recordedMap[watchHourSlot] ?? null

  useEffect(() => {
    if (!watchPartId) return
    const any = slotByHourAllParts[watchHourSlot]
    if (any && any.partId !== watchPartId) {
      setValue('hourSlot', liveSlot)
    }
  }, [watchPartId, slotByHourAllParts, liveSlot, setValue, watchHourSlot])

  // Auto-advance ออกจาก slot ที่บันทึกแล้วสำหรับ Part เดิม เมื่อเปลี่ยน part
  useEffect(() => {
    if (!watchPartId) return
    if (recordedMap[watchHourSlot] && nextEmptySlot != null && nextEmptySlot !== watchHourSlot) {
      setValue('hourSlot', nextEmptySlot)
    }
  }, [watchPartId, watchHourSlot, recordedMap, nextEmptySlot, setValue])

  /** สายที่ใช้งาน (ล็อกจาก QR หรือเลือกจาก dropdown) — logic เดียวกันทั้งสองทาง */
  const lineContextId = useMemo(
    () => (lockedLine ? lockedLine.id : selectedLineId) || '',
    [lockedLine, selectedLineId],
  )

  const lineTargetsForContext = useMemo(() => {
    if (!lineContextId) return []
    return linePartTargetsByLine[lineContextId] ?? []
  }, [lineContextId, linePartTargetsByLine])

  useEffect(() => {
    existingSessionRef.current = initialSession
  }, [initialSession])

  useEffect(() => {
    if (!initialSession || !lineContextId) return
    if (initialSession.lineId !== lineContextId) return
    /** อย่า sync session กะอื่นเข้ามา และอย่าทับ client ที่เพิ่งดึงจาก API ด้วย RSC ที่เก่ากว่า */
    if (initialSession.shiftType !== liveShift) return

    setSessionData((prev: any) => {
      if (!prev?.id) return initialSession
      if (prev.id !== initialSession.id) return initialSession

      const prevU = String(prev.updatedAt ?? '')
      const initU = String(initialSession.updatedAt ?? '')
      if (initU > prevU) return initialSession

      const prevHr = Array.isArray(prev.hourlyRecords) ? prev.hourlyRecords.length : 0
      const initHr = Array.isArray(initialSession.hourlyRecords) ? initialSession.hourlyRecords.length : 0
      if (initU === prevU && initHr > prevHr) return initialSession

      return prev
    })
  }, [
    initialSession,
    initialSession?.id,
    initialSession?.updatedAt,
    initialSession?.lineId,
    initialSession?.shiftType,
    lineContextId,
    liveShift,
  ])

  const filteredTargetsForContext = useMemo(() => {
    const q = partSearch.trim().toLowerCase()
    if (!q) return lineTargetsForContext
    return lineTargetsForContext.filter((pt: any) => {
      const samco = String(pt?.part?.partSamco ?? '').toLowerCase()
      const partNo = String(pt?.part?.partNo ?? '').toLowerCase()
      const partName = String(pt?.part?.partName ?? '').toLowerCase()
      return samco.includes(q) || partNo.includes(q) || partName.includes(q)
    })
  }, [lineTargetsForContext, partSearch])

  const selectedPartOption = useMemo(
    () => lineTargetsForContext.find((pt: any) => pt.partId === watchPartId) ?? null,
    [lineTargetsForContext, watchPartId],
  )

  const handleLineChange = useCallback(
    (lineId: string) => {
      setSelectedLineId(lineId)
      setValue('partId', '')
      setPartSearch('')
      setPartPanelOpen(false)
      setLineSearch('')
      setLinePanelOpen(false)
    },
    [setValue],
  )

  const handleSectionChange = useCallback(
    (sid: string) => {
      setSelectedSectionId(sid)
      setPartSearch('')
      setPartPanelOpen(false)
      setLineSearch('')
      setLinePanelOpen(false)
      setSelectedLineId((prev) => {
        const pool =
          !sid
            ? []
            : sid === SECTION_UNASSIGNED
              ? lines.filter((l: any) => !l.sectionId)
              : lines.filter((l: any) => l.sectionId === sid)
        if (!pool.some((l: any) => l.id === prev)) {
          setValue('partId', '')
          setSessionData(null)
          return ''
        }
        return prev
      })
    },
    [lines, setValue],
  )

  const linesInSection = useMemo(() => {
    if (!selectedSectionId) return []
    if (selectedSectionId === SECTION_UNASSIGNED) {
      return lines.filter((l: any) => !l.sectionId)
    }
    return lines.filter((l: any) => l.sectionId === selectedSectionId)
  }, [lines, selectedSectionId])

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase()
    if (!q) return linesInSection
    return linesInSection.filter((ln: any) => String(ln.lineCode ?? '').toLowerCase().includes(q))
  }, [linesInSection, lineSearch])

  const selectedLine = useMemo(
    () => lines.find((ln: any) => ln.id === selectedLineId) ?? null,
    [lines, selectedLineId],
  )

  useEffect(() => {
    if (lockedLine) setSelectedLineId(lockedLine.id)
  }, [lockedLine])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (linePickerRef.current && !linePickerRef.current.contains(e.target as Node)) {
        setLinePanelOpen(false)
      }
      if (partPickerRef.current && !partPickerRef.current.contains(e.target as Node)) {
        setPartPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])


  const loadInProgressSessionForLine = useCallback(async (lineId: string, signal?: AbortSignal) => {
    if (!lineId) return null
    try {
      const fetchSessionDetailById = async (sessionId: string) => {
        if (!sessionId) return null
        const detailRes = await fetch(`/api/production/sessions/${sessionId}`, { signal })
        if (signal?.aborted || !detailRes.ok) return null
        const dJson = await detailRes.json()
        if (signal?.aborted) return null
        return dJson.data ?? null
      }

      const shiftNow = getCurrentShift()
      const sessionDateStr = formatThaiDateUTCISO(getThaiTodayUTC())
      const reportingDateStr = formatThaiDateUTCISO(getThaiReportingDateUTC())

      const pinnedSession = existingSessionRef.current
      if (pinnedSession?.id && pinnedSession?.lineId === lineId) {
        const pinShift = pinnedSession.shiftType as 'DAY' | 'NIGHT' | undefined
        if (!pinShift || pinShift === shiftNow) {
          const pinnedDetail = await fetchSessionDetailById(String(pinnedSession.id))
          if (
            pinnedDetail &&
            pinnedDetail.status === 'IN_PROGRESS' &&
            pinnedDetail.lineId === lineId &&
            pinnedDetail.shiftType === shiftNow
          ) {
            setSessionData(pinnedDetail)
            return pinnedDetail
          }
        }
      }

      const listParams = new URLSearchParams({
        lineId,
        status: 'IN_PROGRESS',
        date: reportingDateStr,
        sessionDate: sessionDateStr,
        shiftType: shiftNow,
      })
      const listRes = await fetch(`/api/production/sessions?${listParams.toString()}`, { signal })
      if (signal?.aborted || !listRes.ok) return null
      const listJson = await listRes.json()
      if (signal?.aborted) return null
      const sessions: any[] = listJson.data ?? []
      if (sessions.length === 0) {
        const fallbackSession = existingSessionRef.current
        if (
          fallbackSession?.id &&
          fallbackSession?.lineId === lineId &&
          fallbackSession?.status === 'IN_PROGRESS' &&
          fallbackSession?.shiftType === shiftNow
        ) {
          const fallbackDetail = await fetchSessionDetailById(String(fallbackSession.id))
          if (
            fallbackDetail &&
            fallbackDetail.lineId === lineId &&
            fallbackDetail.shiftType === shiftNow
          ) {
            setSessionData(fallbackDetail)
            return fallbackDetail
          }
          setSessionData((prev: any) => (
            prev?.id === fallbackSession.id || (prev?.lineId === lineId && prev?.status === 'IN_PROGRESS')
              ? prev
              : null
          ))
          return fallbackSession
        }
        setSessionData((prev: any) => (
          prev?.lineId === lineId && prev?.status === 'IN_PROGRESS'
            ? prev
            : null
        ))
        return null
      }
      const latestSessionId = String(sessions[0]?.id ?? '')
      const latestDetail = await fetchSessionDetailById(latestSessionId)
      if (latestDetail && latestDetail.shiftType === shiftNow) {
        setSessionData(latestDetail)
        return latestDetail
      }
      return null
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      if (name === 'AbortError') return null
      return null
    }
  }, [])

  useEffect(() => {
    if (!lineContextId) return
    const ac = new AbortController()
    void loadInProgressSessionForLine(lineContextId, ac.signal)
    return () => ac.abort()
  }, [lineContextId, liveShift, loadInProgressSessionForLine])

  useEffect(() => {
    if (!lineContextId) {
      setSiblingShiftOpen(null)
      return
    }
    const ac = new AbortController()
    const compareShift: 'DAY' | 'NIGHT' =
      sessionData?.status === 'IN_PROGRESS' &&
      (sessionData.shiftType === 'DAY' || sessionData.shiftType === 'NIGHT')
        ? sessionData.shiftType
        : liveShift
    ;(async () => {
      try {
        const params = new URLSearchParams({
          lineId: lineContextId,
          sessionDate: recordDateIso,
          status: 'IN_PROGRESS',
        })
        const res = await fetch(`/api/production/sessions?${params}`, { signal: ac.signal })
        if (ac.signal.aborted) return
        if (!res.ok) {
          setSiblingShiftOpen(null)
          return
        }
        const j = await res.json()
        if (ac.signal.aborted) return
        const list: any[] = Array.isArray(j.data) ? j.data : []
        const other = list.find(
          (s) =>
            s.status === 'IN_PROGRESS' &&
            (s.shiftType === 'DAY' || s.shiftType === 'NIGHT') &&
            s.shiftType !== compareShift,
        )
        if (other?.id) {
          setSiblingShiftOpen({ id: String(other.id), shiftType: other.shiftType })
        } else {
          setSiblingShiftOpen(null)
        }
      } catch (e: unknown) {
        const name = e instanceof Error ? e.name : ''
        if (name !== 'AbortError' && !ac.signal.aborted) setSiblingShiftOpen(null)
      }
    })()
    return () => ac.abort()
  }, [lineContextId, recordDateIso, sessionData?.status, sessionData?.shiftType, liveShift])

  useEffect(() => {
    if (defaultPartId && lineTargetsForContext.some((p: any) => p.partId === defaultPartId)) {
      setValue('partId', defaultPartId)
    }
  }, [lineTargetsForContext, defaultPartId, setValue])

  useEffect(() => {
    const pt = lineTargetsForContext.find((p: any) => p.partId === watchPartId)
    setSelectedTarget(pt ?? null)
  }, [watchPartId, lineTargetsForContext])

  const breakdownCategories = problemCategories.filter(p => p.type === 'BREAKDOWN')
  const ngCategories        = problemCategories.filter(p => p.type === 'NG')
  /** เวลาเริ่มชั่วโมงของ slot (สำหรับ Breakdown ต่อนาทีจากต้นชม.) */
  const slotTime            = getSlotStartTime(liveShift, watchHourSlot)

  async function autoCreateSession(lineId: string): Promise<any> {
    if (!lineId) return null

    setCreatingSession(true)
    try {
      const createSession = async (payload: Record<string, unknown>) => {
        const res = await fetch('/api/production/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const text = await res.text()
        let json: any
        try { json = JSON.parse(text) } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`) }
        return { res, json }
      }
      const basePayload = {
        lineId,
        normalHours: 8,
        otHours: 0,
      }
      let { res, json } = await createSession(basePayload)
      if (res.status === 409 && json.data) {

        const det = await fetch(`/api/production/sessions/${json.data.id}`)
        const detJson = await det.json()
        const fullSession = detJson.data ?? json.data
        setSessionData(fullSession)
        setSessionGuardWarning((json.warning as SessionGuardWarning | undefined) ?? null)
        return fullSession
      }
      if (
        res.status === 409 &&
        json?.code === 'LINE_TARGET_MISSING' &&
        json?.guard?.canOverrideMissingTarget
      ) {
        const reasonPrompt = locale === 'th'
          ? `สาย ${json?.guard?.lineCode ?? ''} ยังไม่มี LinePartTarget\nกรอกเหตุผลเพื่อเปิด Session ชั่วคราว:`
          : `Line ${json?.guard?.lineCode ?? ''} has no LinePartTarget.\nEnter reason for temporary override:`
        const reason = window.prompt(reasonPrompt, '')
        const overrideReason = String(reason ?? '').trim()
        if (!overrideReason) {
          toast.error(locale === 'th' ? 'ยกเลิก: ไม่ได้ระบุเหตุผลสำหรับ override' : 'Cancelled: override reason is required.')
          return null
        }
        const overrideReq = await createSession({
          ...basePayload,
          allowNoTargetOverride: true,
          overrideReason,
        })
        res = overrideReq.res
        json = overrideReq.json
      }
      if (!res.ok) throw new Error(json.error ?? 'Failed to create session')

      const newSession = { ...json.data, hourlyRecords: [] }
      setSessionData(newSession)
      setSessionGuardWarning((json.warning as SessionGuardWarning | undefined) ?? null)
      if (json.warning?.code === 'LINE_TARGET_MISSING') {
        toast.warning(json.warning.message ?? t('recordNoLinePartTargets'))
      }
      toast.success(t('recordSessionAutoCreated'))
      return newSession
    } catch (e: any) {
      toast.error(e.message)
      return null
    } finally {
      setCreatingSession(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!operatorId) { toast.error(t('recordReloginQr')); return }


    const freshShift = getCurrentShift()
    const freshSlot  = getCurrentHourSlot(freshShift)
    const allowedMin = Math.max(1, freshSlot - 1)

    if (data.hourSlot < allowedMin || data.hourSlot > freshSlot) {
      toast.error(
        locale === 'th'
          ? `ชั่วโมง ${data.hourSlot} ไม่อยู่ในช่วงที่บันทึกได้ กรุณาเลือกช่วง ${allowedMin}-${freshSlot} (ชั่วโมงปัจจุบันและย้อนหลังได้ 1 ชั่วโมง)`
          : `Slot ${data.hourSlot} not allowed. Permitted: ${allowedMin}-${freshSlot}`,
      )

      setValue('hourSlot', freshSlot)
      setLiveSlot(freshSlot)
      setLiveShift(freshShift)
      return
    }

    const lid = lineContextId
    if (!lid) {
      toast.error(locale === 'th' ? 'เลือกสายการผลิตก่อน' : 'Select a production line first.')
      return
    }

    if (siblingShiftOpen) {
      toast.error(
        locale === 'th'
          ? 'มีกะอื่นที่ยังไม่ปิดบนวันเดียวกัน — ให้ผู้มีสิทธิ์ปิดกะนั้นก่อน (ดูแถบแจ้งเตือนด้านบน หรือไปที่ประวัติ)'
          : 'Another shift is still open for this line and day — close it first (see banner or Production history).',
      )
      return
    }

    let session = sessionData
    if (!session) {
      session = await autoCreateSession(lid)
      if (!session) return
    }

    const breakdownPayload: {
      machineId: string
      breakdownStart: string
      breakdownEnd: string
      breakTimeMin: number
      problemCategoryId: string
      problemDetail?: string
    }[] = []
    if ((data.breakdown?.length ?? 0) > 0) {
      const shiftType = (session.shiftType ?? 'DAY') as 'DAY' | 'NIGHT'
      const intervals = buildBreakdownIntervalsFromSlotMinutes(
        recordDateIso,
        shiftType,
        data.hourSlot,
        (data.breakdown ?? []).map(r => r.breakTimeMin),
      )
      if (!intervals) {
        toast.error(t('recordBreakdownMinutesRule'))
        return
      }
      for (const [index, row] of (data.breakdown ?? []).entries()) {
        const intv = intervals[index]!
        breakdownPayload.push({
          machineId: row.machineId,
          problemCategoryId: row.problemCategoryId,
          problemDetail: row.problemDetail,
          breakdownStart: intv.breakdownStart,
          breakdownEnd: intv.breakdownEnd,
          breakTimeMin: intv.breakTimeMin,
        })
      }
    }

    const defaultNgMid = defaultMachineIdOnLine(machinesOnLine, session.machineId)
    const ngPayload =
      (data.ng?.length ?? 0) > 0
        ? (data.ng ?? []).map((ng) => ({
            ngQty: ng.ngQty,
            problemCategoryId: ng.problemCategoryId,
            problemDetail: ng.problemDetail?.trim() || undefined,
            machineId: (ng.machineId?.trim() || defaultNgMid) || undefined,
          }))
        : []

    setSubmitting(true)
    try {
      const res = await fetch('/api/production/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({
          sessionId: session.id,
          hourSlot:  data.hourSlot,
          partId:    data.partId,
          okQty:     data.okQty,
          remark:    data.remark ?? '',
          breakdown: breakdownPayload,
          ng:        ngPayload,
        }),
      })
      const text = await res.text()
      let json: any
      try { json = JSON.parse(text) } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`) }
      if (!res.ok) {
        if (res.status === 409 && (json.existingPartSamco != null || json.existingPartName)) {
          const who =
            json.existingPartSamco != null
              ? `SAMCO ${json.existingPartSamco}`
              : String(json.existingPartName ?? '')
          throw new Error(
            locale === 'th'
              ? `ชั่วโมงนี้ถูกบันทึกเป็น (${who}) แล้ว กรุณาสลับ Part หรือเลือกชั่วโมงอื่น`
              : `This hour is already recorded (${who}). Switch part or pick another hour.`,
          )
        }
        const msg = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
        throw new Error(msg)
      }
      await loadInProgressSessionForLine(lid)
      toast.success(t('recordSaved'))
      setSubmitted(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }


  function backToHourSelection() {
    setSubmitted(false)
    replaceBd([])
    replaceNg([])
    setValue('okQty', 0)
    setValue('remark', '')
    setValue('hasBreakdown', false)
    setValue('hasNg', false)
    startTransition(() => {
      router.refresh()
    })
  }

  if (requiresScanPin) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6">
        <div className="flex justify-end">{localeToggleMobile}</div>
        <div className="rounded-2xl bg-indigo-600 p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-200">
            <Factory size={18} />
            {locale === 'th' ? 'บันทึกการผลิต' : 'Production record'}
          </div>
          {lockedLine ? (
            <>
              <p className="mt-2 text-2xl font-bold tabular-nums">{lockedLine.lineCode}</p>
              <p className="text-sm text-indigo-200">{lockedLine.lineName}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-indigo-100">
              {locale === 'th'
                ? 'กรอก PIN เพื่อยืนยันตัวตนก่อนบันทึก (สแกน QR)'
                : 'Enter your PIN to continue (QR scan flow).'}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-indigo-100 p-2">
              <User size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">
                {locale === 'th' ? 'กรอก PIN' : 'PIN'}
              </h2>
              <p className="text-xs text-slate-500">Enter your PIN</p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const pin = String(fd.get('pin') ?? '').trim()
              if (!pin) {
                setPinGateError(locale === 'th' ? 'กรุณากรอก PIN' : 'Enter PIN')
                return
              }
              setPinGateLoading(true)
              setPinGateError('')
              try {
                const res = await fetch('/api/auth/pin', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pin }),
                  credentials: 'include',
                })
                const json = await res.json()
                if (!res.ok) {
                  setPinGateError(
                    typeof json.error === 'string' ? json.error : locale === 'th' ? 'ไม่สำเร็จ' : 'Failed',
                  )
                  return
                }
                toast.success(
                  locale === 'th'
                    ? `ยินดีต้อนรับ ${json.data?.firstName ?? ''} ${json.data?.lastName ?? ''}`
                    : `Welcome ${json.data?.firstName ?? ''} ${json.data?.lastName ?? ''}`,
                )
                router.refresh()
              } finally {
                setPinGateLoading(false)
              }
            }}
            className="space-y-4"
          >
            <div>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="PIN"
                autoComplete="one-time-code"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                autoFocus
              />
              {pinGateError ? <p className="mt-2 text-center text-xs text-red-500">{pinGateError}</p> : null}
            </div>
            <button
              type="submit"
              disabled={pinGateLoading}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {pinGateLoading ? <Loader2 size={18} className="mx-auto animate-spin" /> : locale === 'th' ? 'ยืนยัน' : 'Confirm'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <CheckCircle2 size={56} className="text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          {t('recordSavedShort')}
        </h2>
        <p className="text-slate-500 mb-6">
          {t('recordHour')} {watchHourSlot} ({slotTime}) / OK: {watch('okQty')} {t('recordPieces')}
        </p>
        <button
          type="button"
          onClick={backToHourSelection}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('recordNextHour')}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-bold text-slate-800 sm:text-4xl">{t('productionRecord')}</h1>
        <p className="mt-1.5 text-base text-slate-500 sm:text-lg">
          {shiftConfig.label} / {recordDateIso.split('-').reverse().join('/')}
          / {t('recordBreak')} {shiftConfig.breakTime}
          {sessionData && <span className="text-green-600 ml-2">Session {t('recordSessionActive')}</span>}
        </p>
        </div>
        {localeToggleMobile}
      </div>
      {sessionGuardWarning ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">
            {locale === 'th' ? 'คำเตือนการตั้งค่า LinePartTarget' : 'LinePartTarget setup warning'}
          </p>
          <p className="mt-1 leading-relaxed">{sessionGuardWarning.message}</p>
          <p className="mt-1 text-xs text-amber-800/90">
            {locale === 'th'
              ? `สาย ${sessionGuardWarning.lineCode} (${sessionGuardWarning.lineName}) / โหมด ${sessionGuardWarning.mode}`
              : `Line ${sessionGuardWarning.lineCode} (${sessionGuardWarning.lineName}) / mode ${sessionGuardWarning.mode}`}
          </p>
        </div>
      ) : null}

      {siblingShiftOpen ? (
        <div className="rounded-xl border border-orange-400 bg-orange-50 px-4 py-3 text-sm text-orange-950 shadow-sm">
          <p className="font-semibold">
            {locale === 'th' ? 'กะอื่นยังเปิดอยู่ (IN_PROGRESS)' : 'Another shift is still open (IN_PROGRESS)'}
          </p>
          <p className="mt-1 leading-relaxed">
            {locale === 'th'
              ? siblingShiftOpen.shiftType === 'DAY'
                ? 'กะเช้ายังไม่ปิด — ให้ผู้มีสิทธิ์ปิดกะเช้าก่อนบันทึกกะนี้หรือก่อนเปิด session กะถัดไป เพื่อไม่ให้ข้อมูลสับสน'
                : 'กะดึกยังไม่ปิด — ให้ผู้มีสิทธิ์ปิดกะดึกก่อนบันทึกกะนี้หรือก่อนเปิด session กะถัดไป เพื่อไม่ให้ข้อมูลสับสน'
              : siblingShiftOpen.shiftType === 'DAY'
                ? 'Day shift is still open — an authorized user must complete the day session before recording or starting the next shift.'
                : 'Night shift is still open — an authorized user must complete the night session before recording or starting the next shift.'}
          </p>
          <p className="mt-1 text-xs text-orange-900/85">
            {locale === 'th' ? `Session ที่ค้าง: ${siblingShiftOpen.id}` : `Open session id: ${siblingShiftOpen.id}`}
          </p>
          <p className="mt-2">
            <Link
              href="/production/history"
              className="font-medium text-orange-900 underline underline-offset-2 hover:text-orange-950"
            >
              {locale === 'th' ? 'ไปหน้าประวัติการผลิตเพื่อปิดกะ' : 'Open Production history to close the shift'}
            </Link>
          </p>
        </div>
      ) : null}

      {lockedLine ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3.5 text-base text-indigo-950 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Factory className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="font-medium">
              {locale === 'th' ? 'จำกัดเฉพาะไลน์ผลิต' : 'Line filter'}:{' '}
              <span className="tabular-nums">{lockedLine.lineCode}</span>
            </span>
          </div>
          {(() => {
            const snap = displayLineActivityByLineId[lockedLine.id]
            const meta = getLineActivityMeta(snap, t('recordNoDataYet'), liveShift, liveSlot)
            return (
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className={cn('rounded-full px-2 py-0.5 font-medium tabular-nums', meta.badgeClass)}>
                    {meta.slotLabel}
                  </span>
                  <span className="tabular-nums text-indigo-900/90">{meta.partLabel}</span>
                  <span className="tabular-nums text-indigo-950">{meta.qtyLabel}</span>
                </div>
                {meta.recordedAtShort ? (
                  <span className="text-[10px] font-medium tabular-nums text-indigo-900/75">
                    {locale === 'th' ? `ล่าสุด ${meta.recordedAtShort} น.` : `Last save ${meta.recordedAtShort}`}
                  </span>
                ) : null}
              </div>
            )
          })()}
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-700">
            <Factory size={15} />
            {t('recordLineMachinePart')}
          </h3>

          {!lockedLine ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">{t('recordSection')}</label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base outline-none transition-shadow focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">
                    {locale === 'th' ? '— เลือก Section —' : '— Select section —'}
                  </option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sectionCode} — {s.sectionName}
                    </option>
                  ))}
                  {hasUnassignedLines ? (
                    <option value={SECTION_UNASSIGNED}>{t('recordSectionUnassigned')}</option>
                  ) : null}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">{t('line')}</label>
                <div ref={linePickerRef} className="relative">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <input
                      ref={lineSearchInputRef}
                      type="text"
                      inputMode="search"
                      value={lineSearch}
                      disabled={!selectedSectionId}
                      onChange={e => {
                        if (!selectedSectionId) return
                        setLineSearch(e.target.value)
                        setLinePanelOpen(true)
                      }}
                      onFocus={() => {
                        if (selectedSectionId) setLinePanelOpen(true)
                      }}
                      placeholder={
                        selectedSectionId
                          ? locale === 'th'
                            ? 'ค้นหารหัสสาย…'
                            : 'Search line code…'
                          : t('recordSelectSectionFirst')
                      }
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-10 pr-11 text-base outline-none transition-shadow focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
                      aria-expanded={linePanelOpen}
                    />
                    <button
                      type="button"
                      disabled={!selectedSectionId}
                      onClick={() => {
                        if (!selectedSectionId) return
                        setLinePanelOpen(open => !open)
                        queueMicrotask(() => lineSearchInputRef.current?.focus())
                      }}
                      className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t('recordToggleMachineList')}
                    >
                      <ChevronsUpDown className="h-4 w-4" />
                    </button>
                  </div>

                  {linePanelOpen && selectedSectionId ? (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 z-[100] mt-1 w-full list-none overflow-x-hidden overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    style={{ maxHeight: LINE_LIST_MAX_HEIGHT }}
                  >
                    {filteredLines.length === 0 ? (
                      <li className="px-3 py-2.5 text-sm text-slate-400">
                        {linesInSection.length === 0
                          ? t('recordNoLinesInSection')
                          : locale === 'th'
                            ? 'ไม่พบสายที่ค้น'
                            : 'No matching lines'}
                      </li>
                    ) : (
                      filteredLines.map((ln: any) => {
                        const snap = displayLineActivityByLineId[ln.id]
                        const meta = getLineActivityMeta(snap, t('recordNoDataYet'), liveShift, liveSlot)
                        return (
                          <li key={ln.id} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedLineId === ln.id}
                              onClick={() => {
                                handleLineChange(ln.id)
                                setLineSearch('')
                                setLinePanelOpen(false)
                              }}
                              className={cn(
                                'flex w-full items-center gap-3 px-3 py-2.5 text-left text-base transition-colors hover:bg-slate-50',
                                selectedLineId === ln.id && 'bg-blue-50 text-blue-900',
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-slate-800">{ln.lineCode}</div>
                              </div>
                              <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5 text-sm">
                                <div className="flex items-center justify-end gap-2">
                                  <span className={cn('rounded-full px-2 py-0.5 font-medium tabular-nums', meta.badgeClass)}>
                                    {meta.slotLabel}
                                  </span>
                                  <span className="w-14 text-right tabular-nums text-slate-600">{meta.partLabel}</span>
                                  <span className="w-14 text-right tabular-nums text-slate-800">{meta.qtyLabel}</span>
                                </div>
                                {meta.recordedAtShort ? (
                                  <span className="text-[10px] tabular-nums text-slate-500">
                                    {locale === 'th' ? `ล่าสุด ${meta.recordedAtShort} น.` : `Last ${meta.recordedAtShort}`}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                ) : null}
              </div>
              </div>

              {selectedLineId && selectedLine ? (
                <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/85">
                    {t('selected')} — {t('line')}
                  </p>
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-blue-950">{selectedLine.lineCode}</p>
                    </div>
                    {(() => {
                      const snap = displayLineActivityByLineId[selectedLineId]
                      const meta = getLineActivityMeta(snap, t('recordNoDataYet'), liveShift, liveSlot)
                      return (
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className={cn('rounded-full px-2 py-0.5 font-medium tabular-nums', meta.badgeClass)}>
                              {meta.slotLabel}
                            </span>
                            <span className="tabular-nums text-slate-600">{meta.partLabel}</span>
                            <span className="tabular-nums text-slate-800">{meta.qtyLabel}</span>
                          </div>
                          {meta.recordedAtShort ? (
                            <span className="text-[10px] font-medium tabular-nums text-slate-500">
                              {locale === 'th' ? `ล่าสุด ${meta.recordedAtShort} น.` : `Last save ${meta.recordedAtShort}`}
                            </span>
                          ) : null}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {lineContextId && lineTargetsForContext.length > 0 ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">{t('part')}</label>
              <div ref={partPickerRef} className="relative">
                <input type="hidden" {...register('partId')} />
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <input
                    ref={partSearchInputRef}
                    type="text"
                    inputMode="search"
                    value={partSearch}
                    onChange={(e) => {
                      setPartSearch(e.target.value)
                      setPartPanelOpen(true)
                    }}
                    onFocus={() => setPartPanelOpen(true)}
                    placeholder={
                      selectedPartOption
                        ? `${selectedPartOption.part.partSamco} / ${selectedPartOption.part.partName}`
                        : (locale === 'th' ? 'ค้นหา Part / SAMCO / Part No.' : 'Search Part / SAMCO / Part No.')
                    }
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-10 pr-11 text-base outline-none transition-shadow focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    aria-expanded={partPanelOpen}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPartPanelOpen((open) => !open)
                      queueMicrotask(() => partSearchInputRef.current?.focus())
                    }}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
                    aria-label={locale === 'th' ? 'เปิดรายการ Part' : 'Toggle part list'}
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </button>
                </div>

                {partPanelOpen ? (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 z-[100] mt-1 w-full list-none overflow-x-hidden overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    style={{ maxHeight: LINE_LIST_MAX_HEIGHT }}
                  >
                    {filteredTargetsForContext.length === 0 ? (
                      <li className="px-3 py-2.5 text-sm text-slate-400">
                        {locale === 'th' ? 'ไม่พบ Part ที่ค้น' : 'No matching parts'}
                      </li>
                    ) : (
                      filteredTargetsForContext.map((pt: any) => (
                        <li key={pt.partId} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={watchPartId === pt.partId}
                            onClick={() => {
                              setValue('partId', pt.partId, { shouldValidate: true, shouldDirty: true })
                              setPartSearch('')
                              setPartPanelOpen(false)
                            }}
                            className={cn(
                              'flex w-full items-center gap-3 px-3 py-2.5 text-left text-base transition-colors hover:bg-slate-50',
                              watchPartId === pt.partId && 'bg-blue-50 text-blue-900',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-slate-800">
                                {pt.part.partSamco} / {pt.part.partName}
                              </div>
                              <div className="truncate text-xs text-slate-500">
                                {pt.part.partNo || '-'}
                              </div>
                            </div>
                            <div className="ml-auto shrink-0 text-sm tabular-nums text-slate-600">
                              {pt.piecesPerHour} pcs/hr
                            </div>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              {errors.partId && <p className="mt-1 text-sm text-red-500">{errors.partId.message}</p>}
            </div>
          ) : null}

          {selectedTarget?.part && (
            <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/90 to-slate-50/80 p-4 space-y-3 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/80">
                {t('recordSelectedPartDetails')}
              </p>
              <div className="grid gap-2 text-base sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                <div className="min-w-0">
                  <span className="block text-sm text-slate-500">Part No.</span>
                  <span className="block truncate font-mono font-bold text-slate-900">{selectedTarget.part.partNo || '-'}</span>
                </div>
                <div>
                  <span className="block text-sm text-slate-500">SAMCO</span>
                  <span className="block font-mono font-semibold text-slate-900">{selectedTarget.part.partSamco}</span>
                </div>
                <div className="col-span-full grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <div className="min-w-0">
                    <span className="block text-sm text-slate-500">{t('recordPartName')}</span>
                    <span className="block leading-snug text-slate-800">{selectedTarget.part.partName}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm text-slate-500">{t('customer')}</span>
                    <span className="block leading-snug text-slate-800 break-words">
                      {selectedTarget.part.customer
                        ? [selectedTarget.part.customer.customerCode, selectedTarget.part.customer.customerName].filter(Boolean).join(' / ') || '-'
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-blue-100 pt-3 text-center">
                <p className="text-xl font-bold tabular-nums text-blue-900 sm:text-2xl">
                  {t('target')}: {selectedTarget.piecesPerHour}{' '}
                  <span className="text-lg font-semibold sm:text-xl">pcs/hr</span>
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-slate-800 sm:text-xl">
                  8h: {(selectedTarget.target8Hr ?? 0).toLocaleString()}
                  <span className="mx-2 font-normal text-slate-400">·</span>
                  11h: {(selectedTarget.target11Hr ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {!watchPartId && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center text-base text-slate-500 sm:text-lg">
            {!lineContextId
              ? t('recordPickLineFirst')
              : lineTargetsForContext.length === 0
                ? t('recordNoLinePartTargets')
                : t('recordSelectPartAbove')}
          </div>
        )}

        {watchPartId && (
        <>

        <div className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2 sm:text-lg">
              <Clock size={15} />
              {t('recordSelectHourSlot')}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded">
                {t('recordTotalOk')}:&nbsp;
                <span className="font-bold tabular-nums">
                  {Object.values(recordedMap).reduce((s, r) => s + r.okQty, 0).toLocaleString()}
                </span>
                &nbsp;{t('recordPieces')}
              </span>
              <span className="text-slate-400">
                {locale === 'th'
                  ? `${t('recordAllowedRange')} ${minSlot}-${liveSlot}`
                  : `Allowed ${minSlot}-${liveSlot}`}
              </span>
            </div>
          </div>
          <p className="mb-2 text-sm text-slate-500">
            {locale === 'th'
              ? t('recordSlotLegend')
              : 'Under each slot: OK for selected part (green) or another part in the same hour (amber, one part per hour).'}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {shiftConfig.slots.filter(s => !s.isOvertime).map(s => {
              const timeBlocked = s.slot < minSlot || s.slot > liveSlot
              const anyRec = slotByHourAllParts[s.slot]
              const otherPart = anyRec && anyRec.partId !== watchPartId
              const rec = recordedMap[s.slot]
              const disabled = timeBlocked || otherPart || !!rec
              const isActive = watchHourSlot === s.slot
              const dotColor = rec
                ? rec.hasBreakdown
                  ? 'bg-red-500'
                  : rec.hasNg
                    ? 'bg-orange-400'
                    : ''
                : otherPart && anyRec
                  ? anyRec.hasBreakdown
                    ? 'bg-red-500'
                    : anyRec.hasNg
                      ? 'bg-orange-400'
                      : ''
                  : ''
              return (
                <button
                  key={s.slot}
                  type="button"
                  title={
                    rec
                      ? (locale === 'th'
                        ? `ชั่วโมงที่ ${s.slot} บันทึกแล้ว (${rec.okQty} pcs)`
                        : `Slot ${s.slot} already recorded (${rec.okQty} pcs)`)
                      : otherPart && anyRec
                        ? (locale === 'th'
                          ? `ชั่วโมงนี้ถูกบันทึกเป็น SAMCO ${anyRec.partSamco ?? '?'} แล้ว`
                          : `Hour already recorded as SAMCO ${anyRec.partSamco ?? '?'}`)
                        : undefined
                  }
                  disabled={disabled}
                  onClick={() => !disabled && setValue('hourSlot', s.slot)}
                  className={cn(
                    'flex flex-col items-center rounded-lg border py-1.5 px-1 text-xs sm:text-sm font-medium transition-all relative min-h-[4.75rem]',
                    rec
                      ? 'border-green-400 bg-green-50 text-green-700 opacity-60 cursor-default'
                      : disabled && 'opacity-30 cursor-not-allowed',
                    !rec && otherPart && anyRec
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : !rec && isActive
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : !rec && !disabled
                          ? 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                          : '',
                  )}
                >
                  <span className="text-base font-bold leading-none sm:text-lg">{s.slot}</span>
                  <span className="mt-0.5 text-[10px] opacity-70 sm:text-xs">{s.time}</span>
                  {otherPart && anyRec ? (
                    <span className="mt-0.5 text-[10px] leading-tight font-medium text-amber-800/80 sm:text-xs">
                      SAMCO {anyRec.partSamco ?? '?'}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'mt-1 flex min-h-[18px] w-full items-end justify-center text-xs font-bold leading-none tabular-nums sm:text-sm',
                      isActive && !rec ? 'text-blue-100' : otherPart && anyRec ? 'text-amber-900' : 'text-green-800',
                    )}
                  >
                    {rec ? rec.okQty.toLocaleString() : otherPart && anyRec ? anyRec.okQty.toLocaleString() : '-'}
                  </span>
                  {rec ? (
                    <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white" aria-hidden>
                      <CheckCircle2 size={10} strokeWidth={3} />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'pointer-events-none absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full',
                        dotColor || (s.isBreak && !anyRec ? '' : 'hidden'),
                        dotColor,
                      )}
                      aria-hidden
                    >
                      {!dotColor && s.isBreak && !anyRec ? (
                        <Coffee size={10} className="shrink-0 text-orange-500" />
                      ) : null}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1 text-orange-500">
              <Coffee size={11} />
              {locale === 'th' ? `${t('recordBreak')} ${shiftConfig.breakTime}` : `Break ${shiftConfig.breakTime}`}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-green-400 bg-green-50" />
              {t('recordRecordedThisPart')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-amber-400 bg-amber-50" />
              {t('recordOtherPartThisHour')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              {t('recordHasBreakdown')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
              {t('recordHasNg')}
            </span>
          </div>

          {shiftConfig.slots.some(s => s.isOvertime) && (
            <div className="mt-3">
              <p className="mb-1.5 text-sm font-medium text-orange-500">OT</p>
              <div className="grid grid-cols-3 gap-2">
                {shiftConfig.slots.filter(s => s.isOvertime).map(s => {
                  const timeBlocked = s.slot < minSlot || s.slot > liveSlot
                  const anyRec = slotByHourAllParts[s.slot]
                  const otherPart = anyRec && anyRec.partId !== watchPartId
                  const rec = recordedMap[s.slot]
                  const disabled = timeBlocked || otherPart || !!rec
                  const isActive = watchHourSlot === s.slot
                  const dotColor = rec
                    ? rec.hasBreakdown
                      ? 'bg-red-500'
                      : rec.hasNg
                        ? 'bg-orange-400'
                        : ''
                    : otherPart && anyRec
                      ? anyRec.hasBreakdown
                        ? 'bg-red-500'
                        : anyRec.hasNg
                          ? 'bg-orange-400'
                          : ''
                      : ''
                  return (
                    <button
                      key={s.slot}
                      type="button"
                      title={
                        rec
                          ? (locale === 'th'
                            ? `ชั่วโมงที่ ${s.slot} บันทึกแล้ว (${rec.okQty} pcs)`
                            : `Slot ${s.slot} already recorded (${rec.okQty} pcs)`)
                          : otherPart && anyRec
                            ? (locale === 'th'
                              ? `ชั่วโมงนี้ถูกบันทึกเป็น SAMCO ${anyRec.partSamco ?? '?'} แล้ว`
                              : `Hour already recorded as SAMCO ${anyRec.partSamco ?? '?'}`)
                            : undefined
                      }
                      disabled={disabled}
                      onClick={() => !disabled && setValue('hourSlot', s.slot)}
                      className={cn(
                        'flex flex-col items-center rounded-lg border py-1.5 px-1 text-xs sm:text-sm font-medium transition-all relative min-h-[4.75rem]',
                        rec
                          ? 'border-green-400 bg-green-50 text-green-700 opacity-60 cursor-default'
                          : disabled && 'opacity-30 cursor-not-allowed',
                        !rec && otherPart && anyRec
                          ? 'border-amber-400 bg-amber-50 text-amber-900'
                          : !rec && isActive
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : !rec && !disabled
                              ? 'border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-400'
                              : '',
                      )}
                    >
                      <span className="text-base font-bold leading-none sm:text-lg">{s.slot}</span>
                      <span className="mt-0.5 text-[10px] opacity-70 sm:text-xs">{s.time}</span>
                      {otherPart && anyRec ? (
                        <span className="mt-0.5 text-[10px] leading-tight font-medium text-amber-800/80 sm:text-xs">
                          SAMCO {anyRec.partSamco ?? '?'}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'mt-1 flex min-h-[18px] w-full items-end justify-center text-xs font-bold leading-none tabular-nums sm:text-sm',
                          isActive && !rec ? 'text-orange-100' : otherPart && anyRec ? 'text-amber-900' : 'text-green-800',
                        )}
                      >
                        {rec ? rec.okQty.toLocaleString() : otherPart && anyRec ? anyRec.okQty.toLocaleString() : '-'}
                      </span>
                      {rec ? (
                        <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white" aria-hidden>
                          <CheckCircle2 size={10} strokeWidth={3} />
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'pointer-events-none absolute -top-1 -right-1 h-2.5 w-2.5 shrink-0 rounded-full',
                            dotColor || 'hidden',
                            dotColor,
                          )}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Banner: ชั่วโมงนี้บันทึกแล้ว */}
        {selectedSlotRec && (
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={16} className="shrink-0 text-green-600" />
              <p className="text-base text-green-800">
                <span className="font-semibold">
                  {locale === 'th' ? `ชั่วโมงที่ ${watchHourSlot} บันทึกแล้ว` : `Slot ${watchHourSlot} already recorded`}
                </span>
                {' — '}
                <span className="tabular-nums">{selectedSlotRec.okQty.toLocaleString()} pcs</span>
                {selectedSlotRec.hasBreakdown && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-sm text-red-700 font-medium">
                    <Wrench size={10} /> BD
                  </span>
                )}
                {selectedSlotRec.hasNg && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-sm text-orange-700 font-medium">
                    <XCircle size={10} /> NG
                  </span>
                )}
              </p>
            </div>
            {nextEmptySlot != null ? (
              <button
                type="button"
                onClick={() => setValue('hourSlot', nextEmptySlot!)}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {locale === 'th' ? `→ ชั่วโมง ${nextEmptySlot}` : `→ Slot ${nextEmptySlot}`}
              </button>
            ) : (
              <span className="shrink-0 text-sm font-medium text-green-700">
                {locale === 'th' ? 'บันทึกครบทุกชั่วโมงแล้ว ✓' : 'All slots recorded ✓'}
              </span>
            )}
          </div>
        )}

        {/* OK Qty */}
        <div className={cn('rounded-xl border border-slate-100 bg-white p-4 shadow-sm', selectedSlotRec && 'opacity-40 pointer-events-none select-none')}>
          <label className="mb-2 block text-base font-semibold text-slate-700 sm:text-lg">
            {t('okQty')} <span className="text-sm font-normal text-slate-400">({t('recordHour')} {watchHourSlot} / {slotTime})</span>
          </label>
          <input
            type="number"
            {...register('okQty', { valueAsNumber: true })}
            min={0}
            placeholder="0"
            className="w-full rounded-lg border border-slate-200 px-4 py-3 text-center text-2xl font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {errors.okQty && <p className="mt-1 text-sm text-red-500">{errors.okQty.message}</p>}
          {selectedTarget && (
            <p className="mt-2 text-center text-sm text-slate-400">
              {t('target')}: {selectedTarget.piecesPerHour} pcs/hr / {t('actual')}: {watch('okQty') || 0} pcs
            </p>
          )}
        </div>

        {/* Breakdown */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('hasBreakdown')} className="rounded" />
              <span className="flex items-center gap-1.5 text-base font-semibold text-slate-700">
                <Wrench size={14} className="text-red-500" />
                {t('breakdown')}
              </span>
            </label>
            <button type="button"
              onClick={() => {
                setValue('hasBreakdown', true)
                appendBd({ machineId: '', breakTimeMin: 10, problemCategoryId: '' })
              }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> {t('recordAdd')}
            </button>
          </div>
          {watchHasBreakdown && lineContextId && machinesOnLine.length === 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('recordNoMachinesOnLine')}
            </div>
          ) : null}
          {watchHasBreakdown ? (
            <p className="mb-3 text-sm leading-snug text-slate-600">{t('recordBreakdownMinutesRule')}</p>
          ) : null}
          {watchHasBreakdown && bdFields.map((field, i) => (
            <div key={field.id} className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 space-y-2">
              {(() => {
                const breakdownError = errors.breakdown?.[i]
                return (
                  <>
              <div>
                <label className="text-sm text-slate-500">{t('machine')}</label>
                <select
                  {...register(`breakdown.${i}.machineId`)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
                >
                  <option value="">
                    {locale === 'th' ? '— เลือกเครื่องจักร —' : '— Select machine —'}
                  </option>
                  {machinesOnLine.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.mcNo}
                      {m.mcName ? ` — ${m.mcName}` : ''}
                    </option>
                  ))}
                </select>
                {breakdownError?.machineId?.message ? (
                  <p className="mt-1 text-sm text-red-500">{String(breakdownError.machineId.message)}</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm text-slate-500">
                  {t('timeMinutes')}
                  <span className="ml-1 font-normal text-slate-400">
                    ({locale === 'th' ? `ชม. ${watchHourSlot} เริ่ม ${slotTime}` : `slot ${watchHourSlot} @ ${slotTime}`})
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  {...register(`breakdown.${i}.breakTimeMin`, { valueAsNumber: true })}
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                />
                {breakdownError?.breakTimeMin?.message ? (
                  <p className="mt-1 text-sm text-red-500">{String(breakdownError.breakTimeMin.message)}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">{t('recordBreakdownRowsConsecutiveHint')}</p>
              </div>
              <div>
                  <label className="text-sm text-slate-500">{t('cause')}</label>
                  <select {...register(`breakdown.${i}.problemCategoryId`)}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400">
                    <option value="">{t('recordSelectCause')}</option>
                    {breakdownCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.code} / {c.name}</option>
                    ))}
                  </select>
                  {breakdownError?.problemCategoryId?.message ? (
                    <p className="mt-1 text-sm text-red-500">{String(breakdownError.problemCategoryId.message)}</p>
                  ) : null}
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-slate-500">{t('detailsMore')}</label>
                <input {...register(`breakdown.${i}.problemDetail`)} placeholder={t('detailsMore')}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs outline-none" />
              </div>
              <button type="button" onClick={() => removeBd(i)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                <Minus size={12} /> {t('recordRemove')}
              </button>
                  </>
                )
              })()}
            </div>
          ))}
        </div>

        {/* NG */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('hasNg')} className="rounded" />
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <XCircle size={14} className="text-orange-500" />
                NG
              </span>
            </label>
            <button type="button"
              onClick={() => {
                setValue('hasNg', true)
                appendNg({
                  machineId: defaultMachineIdOnLine(machinesOnLine, sessionData?.machineId),
                  ngQty: 1,
                  problemCategoryId: '',
                })
              }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> {t('recordAdd')}
            </button>
          </div>
          {errors.ng && typeof errors.ng === 'object' && 'message' in errors.ng && errors.ng.message ? (
            <p className="mb-2 px-2 text-xs text-red-500">{String(errors.ng.message)}</p>
          ) : null}
          {watchHasNg && lineContextId && machinesOnLine.length === 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('recordNoMachinesOnLine')}
            </div>
          ) : null}
          {watchHasNg && ngFields.map((field, i) => (
            <div key={field.id} className="mb-3 rounded-lg border border-orange-100 bg-orange-50 p-3 space-y-2">
              <div>
                <label className="text-sm text-slate-500">{t('machine')}</label>
                <select
                  {...register(`ng.${i}.machineId`)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                >
                  <option value="">
                    {locale === 'th' ? '— เลือกเครื่องจักร —' : '— Select machine —'}
                  </option>
                  {machinesOnLine.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.mcNo}
                      {m.mcName ? ` — ${m.mcName}` : ''}
                    </option>
                  ))}
                </select>
                {errors.ng?.[i]?.machineId?.message ? (
                  <p className="mt-1 text-sm text-red-500">{String(errors.ng[i]!.machineId!.message)}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-slate-500">{t('ngQty')}</label>
                  <input type="number" min={1} {...register(`ng.${i}.ngQty`, { valueAsNumber: true })}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-sm text-slate-500">{t('recordNgCause')}</label>
                  <select {...register(`ng.${i}.problemCategoryId`)}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400">
                    <option value="">{t('recordSelect')}</option>
                    {ngCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.code} / {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <input {...register(`ng.${i}.problemDetail`)} placeholder={t('detailsMore')}
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none" />
              <button type="button" onClick={() => removeNg(i)} className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-600">
                <Minus size={12} /> {t('recordRemove')}
              </button>
            </div>
          ))}
        </div>

        {/* Remark */}
        <textarea {...register('remark')} rows={2}
          placeholder={t('recordRemarkOptional')}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 resize-none" />

        {/* Submit */}
        {selectedSlotRec ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
            {locale === 'th'
              ? 'ชั่วโมงนี้บันทึกแล้วสำหรับ Part นี้ — เปลี่ยนชั่วโมงหรือ Part ก่อนกดบันทึก'
              : 'This hour is already saved for this part — change hour or part to save again.'}
          </p>
        ) : null}
        <button type="submit" disabled={submitting || creatingSession || !operatorId || !!selectedSlotRec || !!siblingShiftOpen}
          className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-200">
          <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden>
            {submitting || creatingSession ? (
              <Loader2 key="submit-loading" size={18} className="animate-spin" />
            ) : (
              <CheckCircle2 key="submit-idle" size={18} />
            )}
          </span>
          <span>
            {creatingSession ? t('recordCreatingSession') : t('save')}
          </span>
        </button>
        </>
        )}
      </form>
    </div>
  )
}


