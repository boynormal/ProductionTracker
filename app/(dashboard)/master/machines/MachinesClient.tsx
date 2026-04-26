'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Search,
  Plus,
  Cpu,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  X,
  AlertTriangle,
  Loader2,
  ImageIcon,
  LayoutGrid,
  List,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

type DivisionOpt = { id: string; divisionCode: string; divisionName: string }
type SectionOpt = { id: string; sectionCode: string; sectionName: string; divisionId: string }

interface Props {
  machines: any[]
  lines: any[]
  divisions: DivisionOpt[]
  sections: SectionOpt[]
  userRole?: string
}

const emptyMachineForm = {
  mcNo: '',
  mcName: '',
  lineId: '',
  process: '',
  department: '',
}

/** สีการ์ดต่อฝ่าย — วนซ้ำเมื่อฝ่ายมากกว่าจำนวนธีม */
const LINE_CARD_THEMES = [
  { bar: 'border-l-rose-500', soft: 'bg-rose-50/80', accent: 'text-rose-700', dot: 'bg-rose-500' },
  { bar: 'border-l-orange-500', soft: 'bg-orange-50/80', accent: 'text-orange-800', dot: 'bg-orange-500' },
  { bar: 'border-l-amber-500', soft: 'bg-amber-50/80', accent: 'text-amber-800', dot: 'bg-amber-500' },
  { bar: 'border-l-lime-600', soft: 'bg-lime-50/80', accent: 'text-lime-800', dot: 'bg-lime-600' },
  { bar: 'border-l-emerald-500', soft: 'bg-emerald-50/80', accent: 'text-emerald-800', dot: 'bg-emerald-500' },
  { bar: 'border-l-cyan-500', soft: 'bg-cyan-50/80', accent: 'text-cyan-800', dot: 'bg-cyan-500' },
  { bar: 'border-l-sky-500', soft: 'bg-sky-50/80', accent: 'text-sky-800', dot: 'bg-sky-500' },
  { bar: 'border-l-indigo-500', soft: 'bg-indigo-50/80', accent: 'text-indigo-800', dot: 'bg-indigo-500' },
  { bar: 'border-l-violet-500', soft: 'bg-violet-50/80', accent: 'text-violet-800', dot: 'bg-violet-500' },
  { bar: 'border-l-fuchsia-500', soft: 'bg-fuchsia-50/80', accent: 'text-fuchsia-800', dot: 'bg-fuchsia-500' },
] as const

type LineCardTheme = (typeof LINE_CARD_THEMES)[number]

type MachineDisplayGroup = {
  division: DivisionOpt | null
  machines: any[]
}

function themeIndexForDivision(divisionId: string | undefined, divisionsList: DivisionOpt[]) {
  if (!divisionId) return LINE_CARD_THEMES.length - 1
  const i = divisionsList.findIndex((d) => d.id === divisionId)
  return i >= 0 ? i % LINE_CARD_THEMES.length : LINE_CARD_THEMES.length - 1
}

function groupMachinesByDivisionOrder(machines: any[], divisionsOrdered: DivisionOpt[]): MachineDisplayGroup[] {
  const byDiv = new Map<string, any[]>()
  for (const m of machines) {
    const id = m.line?.section?.division?.id ?? '_none'
    if (!byDiv.has(id)) byDiv.set(id, [])
    byDiv.get(id)!.push(m)
  }
  const out: MachineDisplayGroup[] = []
  const used = new Set<string>()

  for (const d of divisionsOrdered) {
    const ms = byDiv.get(d.id)
    if (ms?.length) {
      out.push({
        division: d,
        machines: [...ms].sort((a, b) =>
          String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true }),
        ),
      })
      used.add(d.id)
    }
  }

  for (const [id, ms] of Array.from(byDiv.entries())) {
    if (used.has(id) || id === '_none') continue
    const div = ms[0]?.line?.section?.division
    out.push({
      division: div
        ? { id: div.id, divisionCode: div.divisionCode, divisionName: div.divisionName }
        : null,
      machines: [...ms].sort((a, b) =>
        String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true }),
      ),
    })
    used.add(id)
  }

  const none = byDiv.get('_none')
  if (none?.length) {
    out.push({
      division: null,
      machines: [...none].sort((a, b) =>
        String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true }),
      ),
    })
  }

  return out
}

const COLLAPSED_GROUPS_KEY = 'master-machines-collapsed-division-keys'
const VIEW_MODE_KEY = 'master-machines-view'

function divisionSectionKey(division: DivisionOpt | null, ms: any[]) {
  return division?.id ?? `orphan-${ms[0]?.id ?? 'x'}`
}

function machineMatchesSearch(m: any, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase()
  if (!q) return true
  const hay = [m.mcNo, m.mcName, m.assetCode, m.brand, m.serialNo]
    .filter(Boolean)
    .map((s: string) => String(s).toLowerCase())
  return hay.some((s) => s.includes(q))
}

export function MachinesClient({ machines, lines, divisions, sections, userRole }: Props) {
  const { t, locale } = useI18n()
  const { data: session } = useSession()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [lineFilter, setLineFilter] = useState('all')
  const [filterDivisionId, setFilterDivisionId] = useState('')
  const [filterSectionId, setFilterSectionId] = useState('')

  const tr = useCallback((th: string, en: string) => (locale === 'th' ? th : en), [locale])

  const sectionFilterOptions = useMemo(() => {
    if (!filterDivisionId) return sections
    return sections.filter((s) => s.divisionId === filterDivisionId)
  }, [sections, filterDivisionId])

  const onDivisionChange = useCallback((id: string) => {
    setFilterDivisionId(id)
    setFilterSectionId('')
  }, [])

  useEffect(() => {
    if (!filterSectionId) return
    if (!sectionFilterOptions.some((s) => s.id === filterSectionId)) {
      setFilterSectionId('')
    }
  }, [sectionFilterOptions, filterSectionId])

  const scopeLines = useMemo(() => {
    return lines.filter((l: any) => {
      if (filterSectionId) return l.sectionId === filterSectionId
      if (filterDivisionId) return l.section?.division?.id === filterDivisionId
      return true
    })
  }, [lines, filterDivisionId, filterSectionId])

  useEffect(() => {
    if (lineFilter === 'all') return
    const l = lines.find((x: any) => x.id === lineFilter)
    if (!l) return
    if (filterSectionId && l.sectionId !== filterSectionId) setLineFilter('all')
    else if (!filterSectionId && filterDivisionId && l.section?.division?.id !== filterDivisionId) {
      setLineFilter('all')
    }
  }, [filterDivisionId, filterSectionId, lineFilter, lines])
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(emptyMachineForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [linePickerOpen, setLinePickerOpen] = useState(false)
  const [lineSearchQuery, setLineSearchQuery] = useState('')
  const linePickerRef = useRef<HTMLDivElement | null>(null)

  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'table'
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === 'cards' ? 'cards' : 'table'
  })
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = sessionStorage.getItem(COLLAPSED_GROUPS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as unknown
        if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
      }
    } catch {}
    return []
  })
  const persistCollapsed = useCallback((next: string[]) => {
    setCollapsedGroupKeys(next)
    try {
      sessionStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next))
    } catch {}
  }, [])

  useEffect(() => {
    if (!linePickerOpen) return
    const h = (e: MouseEvent) => {
      if (!linePickerRef.current?.contains(e.target as Node)) setLinePickerOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [linePickerOpen])

  const linesForPicker = useMemo(() => {
    const q = lineSearchQuery.trim().toLowerCase()
    let rows = scopeLines as any[]
    if (q) {
      rows = rows.filter(
        (l) =>
          String(l.lineCode ?? '').toLowerCase().includes(q) ||
          String(l.lineName ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [scopeLines, lineSearchQuery])

  const filtered = machines.filter((m) => {
    const line = m.line
    if (filterSectionId) {
      if (line?.sectionId !== filterSectionId) return false
    } else if (filterDivisionId) {
      if (line?.section?.division?.id !== filterDivisionId) return false
    }
    const matchLine = lineFilter === 'all' || m.lineId === lineFilter
    const matchSearch = machineMatchesSearch(m, search)
    return matchLine && matchSearch
  })

  const hasActiveFilters = Boolean(search || filterDivisionId || filterSectionId || lineFilter !== 'all')

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterDivisionId('')
    setFilterSectionId('')
    setLineFilter('all')
    setLineSearchQuery('')
    setLinePickerOpen(false)
  }, [])

  const selectedLine = lineFilter === 'all' ? null : (lines.find((l: any) => l.id === lineFilter) as any)
  const selectedLineLabel =
    lineFilter === 'all'
      ? tr('ทุกสาย', 'All lines')
      : selectedLine
        ? `${selectedLine.lineCode} — ${selectedLine.lineName ?? ''}`
        : tr('ทุกสาย', 'All lines')

  const canEdit = ['ADMIN', 'ENGINEER'].includes(userRole ?? '')
  const currentUserName = session?.user?.name ?? ''

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  async function handleAddMachine() {
    if (!form.mcNo || !form.mcName || !form.lineId) {
      toast.error(locale === 'th' ? 'กรุณากรอกข้อมูลที่จำเป็น' : 'Please fill required fields')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/master/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcNo: form.mcNo,
          mcName: form.mcName,
          lineId: form.lineId,
          process: form.process || null,
          department: form.department || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Validation error')
        return
      }
      toast.success(locale === 'th' ? 'เพิ่มเครื่องสำเร็จ' : 'Machine added')
      setAddOpen(false)
      setForm(emptyMachineForm)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/master/machines/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(typeof json.error === 'string' ? json.error : 'Failed to delete')
        return
      }
      toast.success(locale === 'th' ? 'ลบเครื่องสำเร็จ' : 'Machine deleted')
      setDeleteTarget(null)
      setDeleteConfirmText('')
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setDeleting(false)
    }
  }

  const deleteConfirmMatch = deleteConfirmText.trim().toLowerCase() === currentUserName.trim().toLowerCase()

  const displayGroups: MachineDisplayGroup[] =
    lineFilter === 'all'
      ? groupMachinesByDivisionOrder(filtered, divisions)
      : (() => {
          const sorted = [...filtered].sort((a, b) =>
            String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true }),
          )
          if (sorted.length === 0) return []
          const lineObj = lines.find((l: any) => l.id === lineFilter) as any
          const div = lineObj?.section?.division
          return [
            {
              division: div
                ? { id: div.id, divisionCode: div.divisionCode, divisionName: div.divisionName }
                : null,
              machines: sorted,
            },
          ]
        })()

  const displayGroupKeys = useMemo(
    () => displayGroups.map(({ division, machines: ms }) => divisionSectionKey(division, ms)),
    [displayGroups],
  )

  const lineForSingleFilter = lineFilter !== 'all' ? (lines.find((l: any) => l.id === lineFilter) as any) : null

  const toggleSectionCollapsed = useCallback((key: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        sessionStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const expandAllSections = useCallback(() => {
    persistCollapsed([])
  }, [persistCollapsed])

  const collapseAllSections = useCallback(() => {
    persistCollapsed(displayGroupKeys)
  }, [displayGroupKeys, persistCollapsed])

  return (
    <div className="-mt-4 space-y-5 sm:-mt-6">
      <div className="sticky top-0 z-20 space-y-4 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{t('masterMachines')}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {filtered.length} / {machines.length} {locale === 'th' ? 'เครื่อง' : 'machines'}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setForm(emptyMachineForm)
                setAddOpen(true)
              }}
              className="flex shrink-0 items-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:self-auto"
            >
              <Plus size={16} />
              {locale === 'th' ? 'เพิ่มเครื่อง' : 'Add Machine'}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[180px] space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                {tr('ชื่อฝ่าย', 'Division')}
              </label>
              <select
                value={filterDivisionId}
                onChange={(e) => onDivisionChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{tr('— ทุกฝ่าย —', '— All divisions —')}</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.divisionCode} — {d.divisionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">{tr('Section', 'Section')}</label>
              <select
                value={filterSectionId}
                onChange={(e) => {
                  const id = e.target.value
                  setFilterSectionId(id)
                  if (id) {
                    const divId = sections.find((s) => s.id === id)?.divisionId
                    if (divId) setFilterDivisionId(divId)
                  }
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{tr('— ทุก Section —', '— All sections —')}</option>
                {sectionFilterOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sectionCode} — {s.sectionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] space-y-1.5" ref={linePickerRef}>
              <label className="block text-xs font-medium text-slate-600">{t('line')}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLinePickerOpen((o) => !o)}
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <span className="truncate">{selectedLineLabel}</span>
                  <ChevronDown size={16} className="shrink-0 text-slate-400" />
                </button>
                {linePickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    <div className="border-b border-slate-100 p-2">
                      <Input
                        value={lineSearchQuery}
                        onChange={(e) => setLineSearchQuery(e.target.value)}
                        placeholder={tr('ค้นหารหัสสาย...', 'Filter lines...')}
                        className="h-9"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      <button
                        type="button"
                        className={cn(
                          'flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50',
                          lineFilter === 'all' && 'bg-blue-50 font-medium text-blue-800',
                        )}
                        onClick={() => {
                          setLineFilter('all')
                          setLinePickerOpen(false)
                          setLineSearchQuery('')
                        }}
                      >
                        {tr('ทุกสาย', 'All lines')}
                      </button>
                      {linesForPicker.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500">{tr('ไม่พบสาย', 'No lines match')}</p>
                      ) : (
                        linesForPicker.map((l: any) => (
                          <button
                            key={l.id}
                            type="button"
                            className={cn(
                              'flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50',
                              lineFilter === l.id && 'bg-blue-50 text-blue-800',
                            )}
                            onClick={() => {
                              setLineFilter(l.id)
                              setLinePickerOpen(false)
                              setLineSearchQuery('')
                            }}
                          >
                            <span className="font-medium">{l.lineCode}</span>
                            {l.lineName ? <span className="text-xs text-slate-500">{l.lineName}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative min-w-[12rem] flex-1 basis-[220px] space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">{tr('ค้นหา', 'Search')}</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    locale === 'th'
                      ? 'รหัสเครื่อง, ชื่อ, Asset, ยี่ห้อ, Serial...'
                      : 'Machine no., name, asset, brand, serial...'
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm leading-none text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters && (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                {tr('ล้างตัวกรอง', 'Clear filters')}
              </Button>
            )}
            {lineFilter === 'all' && displayGroups.length > 1 && (
              <>
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={expandAllSections}>
                  <ChevronsDownUp size={16} />
                  {tr('ขยายทุกฝ่าย', 'Expand all divisions')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={collapseAllSections}>
                  {tr('พับทุกฝ่าย', 'Collapse all divisions')}
                </Button>
              </>
            )}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                  viewMode === 'table' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <List size={16} />
                {tr('ตาราง', 'Table')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                  viewMode === 'cards' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <LayoutGrid size={16} />
                {tr('การ์ด', 'Cards')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Machine list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white py-16 text-center">
          <Cpu size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">{t('noData')}</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="space-y-5">
          {displayGroups.map(({ division, machines: ms }) => {
            const sKey = divisionSectionKey(division, ms)
            const showDivisionHeader = lineFilter === 'all'
            const sectionCollapsed = showDivisionHeader && collapsedGroupKeys.includes(sKey)
            const divIdForTheme = division?.id ?? ms[0]?.line?.section?.division?.id
            const headerTheme = LINE_CARD_THEMES[themeIndexForDivision(divIdForTheme, divisions)]
            const divisionTitle = division
              ? `${division.divisionCode} — ${division.divisionName}`
              : tr('ไม่ระบุฝ่าย', 'Unassigned division')
            return (
              <section key={sKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {showDivisionHeader && (
                  <button
                    type="button"
                    aria-expanded={!sectionCollapsed}
                    onClick={() => toggleSectionCollapsed(sKey)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-800">
                      <ChevronDown
                        className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', sectionCollapsed && '-rotate-90')}
                        aria-hidden
                      />
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${headerTheme.dot}`} aria-hidden />
                      <span className="truncate font-normal text-slate-700">{divisionTitle}</span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {ms.length}
                    </Badge>
                  </button>
                )}
                {lineFilter !== 'all' && lineForSingleFilter ? (
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                    {tr('สาย', 'Line')}: {lineForSingleFilter.lineCode} — {lineForSingleFilter.lineName}
                  </div>
                ) : null}
                {!sectionCollapsed && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm">
                            {tr('รหัสเครื่อง', 'Machine no.')}
                          </TableHead>
                          <TableHead className="min-w-[8rem] px-3 py-2 text-xs sm:text-sm">{tr('ชื่อ', 'Name')}</TableHead>
                          <TableHead className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm">{tr('สาย', 'Line')}</TableHead>
                          <TableHead className="min-w-[7rem] px-3 py-2 text-xs sm:text-sm">{tr('ฝ่าย', 'Division')}</TableHead>
                          <TableHead className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm">{tr('ยี่ห้อ', 'Brand')}</TableHead>
                          <TableHead className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm">Asset</TableHead>
                          <TableHead className="whitespace-nowrap px-3 py-2 text-right text-xs sm:text-sm">
                            {tr('Part ที่ใช้', 'Active parts')}
                          </TableHead>
                          <TableHead className="w-[1%] whitespace-nowrap px-3 py-2 text-right text-xs sm:text-sm">
                            {tr('การทำงาน', 'Actions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ms.map((m: any) => {
                          const divMeta = m.line?.section?.division
                          const divLabel = divMeta
                            ? [divMeta.divisionCode, divMeta.divisionName].filter(Boolean).join(' · ')
                            : '—'
                          const partCount = m.partTargets?.length ?? 0
                          return (
                            <TableRow key={m.id} className="text-sm">
                              <TableCell className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{m.mcNo}</TableCell>
                              <TableCell className="max-w-[14rem] truncate px-3 py-2 text-slate-700">{m.mcName ?? '—'}</TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2 text-slate-600">{m.line?.lineCode ?? '—'}</TableCell>
                              <TableCell className="max-w-[12rem] truncate px-3 py-2 text-slate-600">{divLabel}</TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2 text-slate-600">{m.brand ?? '—'}</TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2 text-slate-600">{m.assetCode ?? '—'}</TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                                {partCount}
                              </TableCell>
                              <TableCell className="whitespace-nowrap px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteTarget(m)
                                        setDeleteConfirmText('')
                                      }}
                                      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                      title={locale === 'th' ? 'ลบ' : 'Delete'}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                  <Link
                                    href={`/master/machines/${m.id}`}
                                    className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
                                  >
                                    {locale === 'th' ? 'รายละเอียด' : 'Details'}
                                    <ChevronRight size={12} />
                                  </Link>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-8">
          {displayGroups.map(({ division, machines: ms }) => {
            const sKey = divisionSectionKey(division, ms)
            const showDivisionHeader = lineFilter === 'all'
            const sectionCollapsed = showDivisionHeader && collapsedGroupKeys.includes(sKey)
            const divIdForTheme = division?.id ?? ms[0]?.line?.section?.division?.id
            const headerTheme = LINE_CARD_THEMES[themeIndexForDivision(divIdForTheme, divisions)]
            const divisionTitle = division
              ? `${division.divisionCode} — ${division.divisionName}`
              : tr('ไม่ระบุฝ่าย', 'Unassigned division')
            return (
              <section key={sKey}>
                {showDivisionHeader && (
                  <button
                    type="button"
                    aria-expanded={!sectionCollapsed}
                    onClick={() => toggleSectionCollapsed(sKey)}
                    className="mb-3 flex w-full max-w-4xl items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ChevronDown
                        className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', sectionCollapsed && '-rotate-90')}
                        aria-hidden
                      />
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${headerTheme.dot}`} aria-hidden />
                      <span className="truncate font-normal text-slate-700">{divisionTitle}</span>
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {ms.length}
                    </Badge>
                  </button>
                )}
                {lineFilter !== 'all' && lineForSingleFilter ? (
                  <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${headerTheme.dot}`} aria-hidden />
                    <span>{tr('สาย', 'Line')}: {lineForSingleFilter.lineCode}</span>
                    <span className="font-normal text-slate-500">— {lineForSingleFilter.lineName}</span>
                  </h2>
                ) : null}
                {!sectionCollapsed && (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {ms.map((m: any) => (
                      <MachineCard
                        key={m.id}
                        machine={m}
                        theme={LINE_CARD_THEMES[themeIndexForDivision(m.line?.section?.division?.id, divisions)]}
                        canEdit={canEdit}
                        locale={locale}
                        onDelete={() => {
                          setDeleteTarget(m)
                          setDeleteConfirmText('')
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Add Machine Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{locale === 'th' ? 'เพิ่มเครื่องจักรใหม่' : 'Add New Machine'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'รหัสเครื่อง' : 'Machine No'} *</Label>
                <Input value={form.mcNo} onChange={e => set('mcNo', e.target.value)} placeholder="LC65,66" />
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'ชื่อเครื่อง' : 'Machine Name'} *</Label>
                <Input value={form.mcName} onChange={e => set('mcName', e.target.value)} placeholder="Mazak CNC" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'สายการผลิต' : 'Line'} *</Label>
              <select
                value={form.lineId}
                onChange={e => set('lineId', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{locale === 'th' ? '— เลือกสาย —' : '— Select Line —'}</option>
                {lines.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.lineCode} — {l.lineName}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Process</Label>
                <Input value={form.process} onChange={e => set('process', e.target.value)} placeholder="Turning" />
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'แผนก' : 'Department'}</Label>
                <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Production" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button onClick={handleAddMachine} disabled={saving}>
              {saving ? <><Loader2 size={16} className="mr-1 animate-spin" />{locale === 'th' ? 'กำลังบันทึก...' : 'Saving...'}</> : (locale === 'th' ? 'บันทึก' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteConfirmText('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={20} />
              {locale === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-slate-600">
              {locale === 'th'
                ? <>คุณกำลังจะลบเครื่อง <strong>{deleteTarget?.mcNo}</strong> กรุณาพิมพ์ชื่อผู้ใช้ของคุณเพื่อยืนยัน:</>
                : <>You are about to delete machine <strong>{deleteTarget?.mcNo}</strong>. Type your username to confirm:</>}
            </p>
            <div className="grid gap-1.5">
              <Label className="text-xs text-slate-500">
                {locale === 'th' ? `พิมพ์ "${currentUserName}" เพื่อยืนยัน` : `Type "${currentUserName}" to confirm`}
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={currentUserName}
                className="border-red-200 focus:border-red-400 focus:ring-red-100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }}>
              {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deleteConfirmMatch || deleting}
            >
              {deleting ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
              {locale === 'th' ? 'ลบเครื่อง' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MachineCard({
  machine: m,
  theme,
  canEdit,
  locale,
  onDelete,
}: {
  machine: any
  theme: LineCardTheme
  canEdit: boolean
  locale: string
  onDelete: () => void
}) {
  const primaryUrl = m.images?.[0]?.url as string | undefined
  const imgAlt = m.mcName ? `${m.mcNo} — ${m.mcName}` : String(m.mcNo ?? 'machine')

  return (
    <div
      className={`group overflow-hidden rounded-xl border border-slate-200/90 border-l-4 ${theme.bar} ${theme.soft} shadow-sm transition-all hover:shadow-md hover:border-slate-300`}
    >
      <div className="px-3 pb-3 pt-2.5 sm:px-4">
        <div className="flex gap-2.5 sm:gap-3">
          <div
            className="relative h-14 w-[4.25rem] shrink-0 overflow-hidden rounded-lg border border-slate-200/90 bg-slate-100 shadow-inner sm:h-16 sm:w-20"
            title={imgAlt}
          >
            {primaryUrl ? (
              <Image
                src={primaryUrl}
                alt={imgAlt}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized={
                  primaryUrl.startsWith('data:') ||
                  primaryUrl.startsWith('blob:')
                }
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-slate-300" strokeWidth={1.25} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <h3 className="text-base font-bold leading-tight text-slate-800 sm:text-lg">{m.mcNo}</h3>
              {canEdit && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title={locale === 'th' ? 'ลบ' : 'Delete'}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {m.mcName ? (
              <p className="mt-0.5 truncate text-xs text-slate-600">{m.mcName}</p>
            ) : null}

            <p className={`mt-0.5 truncate text-xs font-medium sm:text-sm ${theme.accent}`}>
              {m.line?.lineCode}
              {m.process ? ` · ${m.process}` : ''}
            </p>

            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {locale === 'th' ? 'Parts' : 'Parts'}:{' '}
              <span className="font-semibold tabular-nums">{m.partTargets?.length ?? 0}</span>
            </p>
          </div>
        </div>

        <Link
          href={`/master/machines/${m.id}`}
          className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-white/60 py-1.5 text-xs font-medium text-slate-600 backdrop-blur-[2px] transition-colors hover:border-slate-300 hover:bg-white hover:text-blue-700"
        >
          {locale === 'th' ? 'รายละเอียด' : 'Details'}
          <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  )
}
