'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, Plus, Cpu, ChevronRight, X, AlertTriangle, Loader2, ImageIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

/** สีการ์ดต่อสาย — วนซ้ำเมื่อสายมากกว่าจำนวนธีม */
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

function themeIndexForLine(lineId: string | undefined, lines: { id: string }[]) {
  const i = lines.findIndex(l => l.id === lineId)
  return i >= 0 ? i % LINE_CARD_THEMES.length : LINE_CARD_THEMES.length - 1
}

function groupMachinesByLineOrder(machines: any[], lines: any[]) {
  const byLine = new Map<string, any[]>()
  for (const m of machines) {
    const id = m.lineId ?? '_none'
    if (!byLine.has(id)) byLine.set(id, [])
    byLine.get(id)!.push(m)
  }
  const out: { line: any | null; machines: any[] }[] = []
  const used = new Set<string>()

  for (const l of lines) {
    const ms = byLine.get(l.id)
    if (ms?.length) {
      out.push({
        line: l,
        machines: [...ms].sort((a, b) =>
          String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true })
        ),
      })
      used.add(l.id)
    }
  }

  for (const [id, ms] of Array.from(byLine.entries())) {
    if (used.has(id) || id === '_none') continue
    const sorted = [...ms].sort((a, b) =>
      String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true })
    )
    out.push({ line: sorted[0]?.line ?? null, machines: sorted })
    used.add(id)
  }

  const none = byLine.get('_none')
  if (none?.length) {
    out.push({
      line: null,
      machines: [...none].sort((a, b) =>
        String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true })
      ),
    })
  }

  return out
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

  const linesForGrouping = useMemo(() => {
    if (filterSectionId || filterDivisionId) return scopeLines
    return lines
  }, [lines, scopeLines, filterDivisionId, filterSectionId])

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

  const filtered = machines.filter((m) => {
    const line = m.line
    if (filterSectionId) {
      if (line?.sectionId !== filterSectionId) return false
    } else if (filterDivisionId) {
      if (line?.section?.division?.id !== filterDivisionId) return false
    }
    const matchLine = lineFilter === 'all' || m.lineId === lineFilter
    const matchSearch =
      !search ||
      m.mcNo.toLowerCase().includes(search.toLowerCase()) ||
      m.mcName.toLowerCase().includes(search.toLowerCase())
    return matchLine && matchSearch
  })

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

  const displayGroups =
    lineFilter === 'all'
      ? groupMachinesByLineOrder(filtered, linesForGrouping)
      : [
          {
            line: lines.find((l: any) => l.id === lineFilter) ?? null,
            machines: [...filtered].sort((a, b) =>
              String(a.mcNo ?? '').localeCompare(String(b.mcNo ?? ''), undefined, { numeric: true })
            ),
          },
        ].filter(g => g.machines.length > 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('masterMachines')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} / {machines.length} {locale === 'th' ? 'เครื่อง' : 'machines'}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setForm(emptyMachineForm); setAddOpen(true) }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            {locale === 'th' ? 'เพิ่มเครื่อง' : 'Add Machine'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 sm:gap-4">
        <div className="min-w-[180px] space-y-1.5">
          <label className="block text-xs font-medium text-slate-600">
            {tr('ชื่อฝ่าย', 'Division')}
          </label>
          <select
            value={filterDivisionId}
            onChange={(e) => onDivisionChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
          <label className="block text-xs font-medium text-slate-600">Section</label>
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
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{tr('— ทุก Section —', '— All sections —')}</option>
            {sectionFilterOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sectionCode} — {s.sectionName}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px] space-y-1.5">
          <label className="block text-xs font-medium text-slate-600">{t('line')}</label>
          <select
            value={lineFilter}
            onChange={e => setLineFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
          >
            <option value="all">{locale === 'th' ? 'ทุกสาย' : 'All Lines'}</option>
            {scopeLines.map((l: any) => (
              <option key={l.id} value={l.id}>{l.lineCode}</option>
            ))}
          </select>
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">{tr('ค้นหา', 'Search')}</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={locale === 'th' ? 'ค้นหาเครื่อง...' : 'Search machines...'}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-100 py-16 text-center">
          <Cpu size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">{t('noData')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {displayGroups.map(({ line, machines: ms }) => {
            const sectionKey = line?.id ?? `orphan-${ms[0]?.id ?? 'x'}`
            const headerTheme = LINE_CARD_THEMES[themeIndexForLine(line?.id ?? ms[0]?.lineId, lines)]
            return (
              <section key={sectionKey}>
                {lineFilter === 'all' && line && (
                  <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${headerTheme.dot}`} aria-hidden />
                    <span>{line.lineCode}</span>
                    <span className="font-normal text-slate-500">— {line.lineName}</span>
                  </h2>
                )}
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {ms.map((m: any) => (
                    <MachineCard
                      key={m.id}
                      machine={m}
                      theme={LINE_CARD_THEMES[themeIndexForLine(m.lineId, lines)]}
                      canEdit={canEdit}
                      locale={locale}
                      onDelete={() => { setDeleteTarget(m); setDeleteConfirmText('') }}
                    />
                  ))}
                </div>
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
