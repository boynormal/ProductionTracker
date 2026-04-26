'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil, Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import { DASHBOARD_THEAD_STICKY } from '@/lib/dashboard-sticky-table-classes'

export type PartOption = {
  id: string
  partSamco: number
  partName: string
  customer: { customerCode: string | null } | null
}

export type LinePartTargetRow = {
  id: string
  lineId: string
  partId: string
  cycleTimeMin: number | null
  piecesPerHour: number
  target8Hr: number
  target11Hr: number
  efficiency: number
  isActive: boolean
  part: {
    partSamco: number
    partName: string
    customer: { customerCode: string | null } | null
  }
}

const inputCls =
  'flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-200'

function parseEffPercent(s: string): number {
  const t = s.trim().replace('%', '')
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return 0.85
  return Math.min(1, Math.max(0, n / 100))
}

function parseIntField(s: string, fallback: number): number {
  const n = parseInt(s.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : fallback
}

/** ว่าง = null (ไม่บังคับ cycle ระดับสาย) */
function parseCycleOptional(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = parseFloat(t.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({}))
  if (typeof json.error === 'string') return json.error
  return 'คำขอไม่สำเร็จ'
}

function formatPartLabel(p: PartOption): string {
  const c = p.customer?.customerCode
  return `${p.partSamco} — ${p.partName}${c ? ` (${c})` : ''}`
}

export function LinePartTargetsPageClient({
  lineId,
  lineLabel,
  initialTargets,
  parts,
  canEdit,
}: {
  lineId: string
  lineLabel: string
  initialTargets: LinePartTargetRow[]
  parts: PartOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [partComboText, setPartComboText] = useState('')
  const [partListOpen, setPartListOpen] = useState(false)
  const partComboRef = useRef<HTMLDivElement>(null)

  const [addPartId, setAddPartId] = useState('')
  const [addCycle, setAddCycle] = useState('')
  const [addPph, setAddPph] = useState('30')
  const [addT8, setAddT8] = useState('199')
  const [addT11, setAddT11] = useState('267')
  const [addEff, setAddEff] = useState('85')

  const [editCycle, setEditCycle] = useState('')
  const [editPph, setEditPph] = useState('')
  const [editT8, setEditT8] = useState('')
  const [editT11, setEditT11] = useState('')
  const [editEff, setEditEff] = useState('')

  const activePartIds = useMemo(
    () => new Set(initialTargets.filter(t => t.isActive).map(t => t.partId)),
    [initialTargets],
  )

  const addableParts = useMemo(() => parts.filter(p => !activePartIds.has(p.id)), [parts, activePartIds])

  const filteredAddableParts = useMemo(() => {
    const q = partComboText.trim().toLowerCase()
    if (!q) return addableParts
    return addableParts.filter(
      p =>
        String(p.partSamco).includes(q) ||
        p.partName.toLowerCase().includes(q) ||
        (p.customer?.customerCode ?? '').toLowerCase().includes(q),
    )
  }, [addableParts, partComboText])

  const selectedAddablePart = useMemo(
    () => addableParts.find(p => p.id === addPartId) ?? null,
    [addableParts, addPartId],
  )

  useEffect(() => {
    if (!partListOpen) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (partComboRef.current?.contains(t)) return
      setPartListOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [partListOpen])

  function pickPartForAdd(p: PartOption) {
    setAddPartId(p.id)
    setPartComboText(formatPartLabel(p))
    setPartListOpen(false)
  }

  function onPartComboChange(v: string) {
    setPartComboText(v)
    setPartListOpen(true)
    if (!selectedAddablePart || formatPartLabel(selectedAddablePart) !== v) {
      setAddPartId('')
    }
  }

  function startEdit(row: LinePartTargetRow) {
    setEditingId(row.id)
    setEditCycle(row.cycleTimeMin != null ? String(row.cycleTimeMin) : '')
    setEditPph(String(row.piecesPerHour))
    setEditT8(String(row.target8Hr))
    setEditT11(String(row.target11Hr))
    setEditEff(String(Math.round(row.efficiency * 100)))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleAdd() {
    if (!addPartId) {
      toast.error('เลือก Part')
      return
    }
    setBusy('add')
    try {
      const res = await fetch(`/api/master/lines/${lineId}/line-part-targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partId: addPartId,
          cycleTimeMin: parseCycleOptional(addCycle),
          piecesPerHour: parseIntField(addPph, 0),
          target8Hr: parseIntField(addT8, 0),
          target11Hr: parseIntField(addT11, 0),
          efficiency: parseEffPercent(addEff),
          isActive: true,
        }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      toast.success('เพิ่ม Part ในเป้าระดับสายแล้ว')
      setAddPartId('')
      setPartComboText('')
      setPartListOpen(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveEdit(id: string) {
    setBusy(`edit-${id}`)
    try {
      const res = await fetch(`/api/master/lines/${lineId}/line-part-targets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleTimeMin: parseCycleOptional(editCycle),
          piecesPerHour: parseIntField(editPph, 0),
          target8Hr: parseIntField(editT8, 0),
          target11Hr: parseIntField(editT11, 0),
          efficiency: parseEffPercent(editEff),
        }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      toast.success('บันทึกแล้ว')
      setEditingId(null)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(null)
    }
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm('ปิดใช้งานแถวนี้? (ยังแก้กลับได้ด้วยปุ่มเปิดใช้)')) return
    setBusy(`off-${id}`)
    try {
      const res = await fetch(`/api/master/lines/${lineId}/line-part-targets/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      toast.success('ปิดใช้งานแล้ว')
      if (editingId === id) setEditingId(null)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(null)
    }
  }

  async function handleReactivate(id: string) {
    setBusy(`on-${id}`)
    try {
      const res = await fetch(`/api/master/lines/${lineId}/line-part-targets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      toast.success('เปิดใช้งานแล้ว')
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        เป้าระดับสายใช้เลือก Part และคำนวณเป้าบนหน้าบันทึกการผลิต (ไม่ใช่เป้าต่อเครื่อง) — <span className="font-medium text-slate-800">{lineLabel}</span>
      </p>

      {canEdit ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">เพิ่ม Part (ยังไม่มีแถว active สำหรับ Part นั้น)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs" htmlFor="part-combo-add-line">
                เลือก Part (พิมพ์ค้นหา) *
              </Label>
              <div ref={partComboRef} className="relative z-10">
                <Input
                  id="part-combo-add-line"
                  className={inputCls}
                  value={partComboText}
                  onChange={e => onPartComboChange(e.target.value)}
                  onFocus={() => addableParts.length > 0 && setPartListOpen(true)}
                  placeholder={
                    addableParts.length === 0
                      ? 'ทุก Part มีแถว active แล้ว'
                      : 'พิมพ์ Samco / ชื่อ / ลูกค้า แล้วเลือกจากรายการ'
                  }
                  disabled={!!busy || addableParts.length === 0}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={partListOpen}
                  aria-controls="part-combo-list-line"
                  aria-autocomplete="list"
                />
                {partListOpen && addableParts.length > 0 ? (
                  <ul
                    id="part-combo-list-line"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-[50] mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
                  >
                    {filteredAddableParts.length === 0 ? (
                      <li className="px-2 py-2 text-slate-500">ไม่พบรายการที่ตรงกับคำค้น</li>
                    ) : (
                      filteredAddableParts.map(p => (
                        <li key={p.id} role="option" aria-selected={addPartId === p.id}>
                          <button
                            type="button"
                            className="flex w-full px-2 py-1.5 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => pickPartForAdd(p)}
                          >
                            <span className="font-mono font-semibold text-blue-700">{p.partSamco}</span>
                            <span className="ml-2 truncate text-slate-700">{p.partName}</span>
                            {p.customer?.customerCode ? (
                              <span className="ml-2 shrink-0 text-slate-400">{p.customer.customerCode}</span>
                            ) : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Cycle (min) — ไม่บังคับ</Label>
              <Input className={inputCls} value={addCycle} onChange={e => setAddCycle(e.target.value)} inputMode="decimal" placeholder="เว้นว่างได้" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">pcs/hr</Label>
              <Input className={inputCls} value={addPph} onChange={e => setAddPph(e.target.value)} inputMode="numeric" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Target 8hr</Label>
              <Input className={inputCls} value={addT8} onChange={e => setAddT8(e.target.value)} inputMode="numeric" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Target 11hr</Label>
              <Input className={inputCls} value={addT11} onChange={e => setAddT11(e.target.value)} inputMode="numeric" />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Efficiency (%)</Label>
              <Input className={inputCls} value={addEff} onChange={e => setAddEff(e.target.value)} inputMode="decimal" placeholder="85" />
            </div>
          </div>
          <Button type="button" size="sm" disabled={!!busy || !addPartId} onClick={handleAdd} className="gap-2">
            {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : null}
            เพิ่ม
          </Button>
        </div>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          ดูอย่างเดียว — เฉพาะ Admin / Engineer แก้ไขได้
        </p>
      )}

      <div className="min-w-0 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className={cn(DASHBOARD_THEAD_STICKY, 'bg-slate-50 shadow-sm')}>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Samco</th>
              <th className="px-2 py-2">Part</th>
              <th className="px-2 py-2">Cust.</th>
              <th className="px-2 py-2 text-right">Cycle</th>
              <th className="px-2 py-2 text-right">pph</th>
              <th className="px-2 py-2 text-right">T8</th>
              <th className="px-2 py-2 text-right">T11</th>
              <th className="px-2 py-2 text-right">Eff%</th>
              <th className="px-2 py-2">สถานะ</th>
              {canEdit ? <th className="px-2 py-2 w-[140px]">การทำงาน</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialTargets.map(row => {
              const isEdit = editingId === row.id
              const cycleDisp =
                row.cycleTimeMin != null && Number.isFinite(Number(row.cycleTimeMin))
                  ? Number(row.cycleTimeMin).toFixed(2)
                  : '—'
              return (
                <tr
                  key={row.id}
                  className={row.isActive ? 'hover:bg-blue-50/50' : 'bg-slate-50/80 text-slate-500'}
                >
                  <td className="px-2 py-2 font-mono font-bold text-blue-700">{row.part.partSamco}</td>
                  <td className="px-2 py-2 max-w-[200px] truncate" title={row.part.partName}>
                    {row.part.partName}
                  </td>
                  <td className="px-2 py-2 text-slate-500">{row.part.customer?.customerCode ?? '—'}</td>
                  {!isEdit ? (
                    <>
                      <td className="px-2 py-2 text-right font-mono">{cycleDisp}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold">{row.piecesPerHour}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.target8Hr.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono">{row.target11Hr.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono">{(row.efficiency * 100).toFixed(0)}%</td>
                      <td className="px-2 py-2">
                        {row.isActive ? (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            ปิด
                          </span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-1.5 text-[10px]"
                              disabled={!!busy}
                              onClick={() => startEdit(row)}
                            >
                              <Pencil size={12} className="mr-0.5" />
                              แก้ไข
                            </Button>
                            {row.isActive ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[10px] text-amber-700"
                                disabled={!!busy}
                                onClick={() => handleDeactivate(row.id)}
                              >
                                <Ban size={12} className="mr-0.5" />
                                ปิด
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[10px] text-green-700"
                                disabled={!!busy}
                                onClick={() => handleReactivate(row.id)}
                              >
                                <RotateCcw size={12} className="mr-0.5" />
                                เปิด
                              </Button>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <td className="px-1 py-1" colSpan={5}>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          <div className="grid gap-0.5">
                            <Label className="text-[10px]">Cycle (ว่างได้)</Label>
                            <Input className={inputCls} value={editCycle} onChange={e => setEditCycle(e.target.value)} />
                          </div>
                          <div className="grid gap-0.5">
                            <Label className="text-[10px]">pph</Label>
                            <Input className={inputCls} value={editPph} onChange={e => setEditPph(e.target.value)} />
                          </div>
                          <div className="grid gap-0.5">
                            <Label className="text-[10px]">T8</Label>
                            <Input className={inputCls} value={editT8} onChange={e => setEditT8(e.target.value)} />
                          </div>
                          <div className="grid gap-0.5">
                            <Label className="text-[10px]">T11</Label>
                            <Input className={inputCls} value={editT11} onChange={e => setEditT11(e.target.value)} />
                          </div>
                          <div className="grid gap-0.5">
                            <Label className="text-[10px]">Eff%</Label>
                            <Input className={inputCls} value={editEff} onChange={e => setEditEff(e.target.value)} />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        {row.isActive ? (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            ปิด
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-[10px]"
                            disabled={!!busy}
                            onClick={() => handleSaveEdit(row.id)}
                          >
                            {busy === `edit-${row.id}` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              'บันทึก'
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            disabled={!!busy}
                            onClick={cancelEdit}
                          >
                            ยกเลิก
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {initialTargets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีแถวเป้าระดับสาย — เพิ่มจากด้านบน (ถ้ามีสิทธิ์)</p>
        ) : null}
      </div>
    </div>
  )
}
