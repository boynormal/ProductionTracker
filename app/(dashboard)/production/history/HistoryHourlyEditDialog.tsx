'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { getThaiTodayUTC, formatThaiDateUTCISO } from '@/lib/time-utils'
import { buildBreakdownIntervalsFromSlotMinutes } from '@/lib/utils/breakdown-datetime'
import { getSlotStartTime } from '@/lib/utils/shift'
import { cn } from '@/lib/utils/cn'

type EdBreak = {
  key: string
  breakTimeMin: number
  problemCategoryId: string
  problemDetail: string
  actionTaken: string
  machineId: string
}

type EdNg = {
  key: string
  ngQty: number
  problemCategoryId: string
  problemDetail: string
  actionTaken: string
  machineId: string
}

function fromApiBreakdown(bd: any): EdBreak {
  const m = Number(bd.breakTimeMin)
  return {
    key: bd.id || `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    breakTimeMin: Number.isFinite(m) && m >= 1 ? Math.min(60, Math.round(m)) : 10,
    problemCategoryId: bd.problemCategoryId || '',
    problemDetail: bd.problemDetail ?? '',
    actionTaken: bd.actionTaken ?? '',
    machineId: bd.machineId ?? '',
  }
}

function fromApiNg(ng: any): EdNg {
  return {
    key: ng.id || `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ngQty: Math.max(1, Number(ng.ngQty) || 1),
    problemCategoryId: ng.problemCategoryId || '',
    problemDetail: ng.problemDetail ?? '',
    actionTaken: ng.actionTaken ?? '',
    machineId: ng.machineId ?? '',
  }
}

export function HistoryHourlyEditDialog({
  open,
  recordId,
  onOpenChange,
  locale,
  onSaved,
}: {
  open: boolean
  recordId: string | null
  onOpenChange: (open: boolean) => void
  locale: string
  onSaved: () => void | Promise<void>
}) {
  const th = locale === 'th'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)
  const [okQty, setOkQty] = useState(0)
  const [remark, setRemark] = useState('')
  const [partId, setPartId] = useState('')
  const [breaks, setBreaks] = useState<EdBreak[]>([])
  const [ngs, setNgs] = useState<EdNg[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [lineTargets, setLineTargets] = useState<any[]>([])
  const [catsBd, setCatsBd] = useState<any[]>([])
  const [catsNg, setCatsNg] = useState<any[]>([])

  const reset = useCallback(() => {
    setDetail(null)
    setOkQty(0)
    setRemark('')
    setPartId('')
    setBreaks([])
    setNgs([])
    setMachines([])
    setLineTargets([])
    setCatsBd([])
    setCatsNg([])
  }, [])

  useEffect(() => {
    if (!open || !recordId) {
      reset()
      return
    }

    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const r = await fetch(`/api/production/records/${recordId}`)
        const j = await r.json()
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Load failed')
        const d = j.data
        if (cancelled || !d) return

        const lineId = d.session?.lineId as string | undefined

        const [mRes, pRes, bdRes, ngRes] = await Promise.all([
          lineId ?
            fetch(`/api/master/machines?lineId=${encodeURIComponent(lineId)}&limit=300`)
          : Promise.resolve(null),
          lineId ? fetch(`/api/master/lines/${lineId}/line-part-targets`) : Promise.resolve(null),
          fetch('/api/master/problem-categories?type=BREAKDOWN&limit=200'),
          fetch('/api/master/problem-categories?type=NG&limit=200'),
        ])

        if (cancelled) return

        const mJson = mRes ? await mRes.json().catch(() => ({})) : {}
        const pJson = pRes ? await pRes.json().catch(() => ({})) : {}
        const bdJson = await bdRes.json().catch(() => ({}))
        const ngJson = await ngRes.json().catch(() => ({}))

        if (cancelled) return

        setMachines(Array.isArray(mJson.data) ? mJson.data : [])
        setLineTargets(Array.isArray(pJson.data) ? pJson.data : [])
        setCatsBd(Array.isArray(bdJson.data) ? bdJson.data : [])
        setCatsNg(Array.isArray(ngJson.data) ? ngJson.data : [])

        setDetail(d)
        setOkQty(Number(d.okQty) || 0)
        setRemark(d.remark ?? '')
        setPartId(d.partId ?? '')
        setBreaks((d.breakdownLogs ?? []).map(fromApiBreakdown))
        setNgs((d.ngLogs ?? []).map(fromApiNg))
      } catch (e: any) {
        if (!cancelled) toast.error(e.message ?? 'Error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, recordId, reset])

  async function handleSave() {
    if (!recordId || !detail) return

    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i]!
      if (!b.problemCategoryId.trim()) {
        toast.error(th ? `Breakdown แถว ${i + 1}: เลือกหมวด` : `Breakdown row ${i + 1}: pick category`)
        return
      }
      if (machines.length > 0 && !b.machineId.trim()) {
        toast.error(th ? `Breakdown แถว ${i + 1}: เลือกเครื่อง` : `Breakdown row ${i + 1}: pick machine`)
        return
      }
    }
    for (let i = 0; i < ngs.length; i++) {
      const n = ngs[i]!
      if (!n.problemCategoryId.trim()) {
        toast.error(th ? `NG แถว ${i + 1}: เลือกหมวด` : `NG row ${i + 1}: pick category`)
        return
      }
      if (machines.length > 0 && !n.machineId.trim()) {
        toast.error(th ? `NG แถว ${i + 1}: เลือกเครื่อง` : `NG row ${i + 1}: pick machine`)
        return
      }
    }

    const dateIso =
      detail.session?.sessionDate ?
        formatThaiDateUTCISO(new Date(detail.session.sessionDate))
      : formatThaiDateUTCISO(getThaiTodayUTC())
    const shiftType = (detail.session?.shiftType ?? 'DAY') as 'DAY' | 'NIGHT'
    const hourSlot = Math.min(11, Math.max(1, Number(detail.hourSlot) || 1))

    const finalizedBd: {
      breakdownStart: string
      breakdownEnd: string
      breakTimeMin: number
      problemCategoryId: string
      problemDetail?: string
      actionTaken?: string
      machineId?: string
    }[] = []

    if (breaks.length > 0) {
      const intervals = buildBreakdownIntervalsFromSlotMinutes(
        dateIso,
        shiftType,
        hourSlot,
        breaks.map(b => b.breakTimeMin),
      )
      if (!intervals) {
        toast.error(
          th ?
            'Breakdown: กรอกนาที (1–60) ต่อแถว และรวมทุกแถวไม่เกิน 60 นาทีต่อชั่วโมง'
          : 'Breakdown: enter 1–60 minutes per row; total must not exceed 60 minutes per hour.',
        )
        return
      }
      for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i]!
        const intv = intervals[i]!
        finalizedBd.push({
          breakdownStart: intv.breakdownStart,
          breakdownEnd: intv.breakdownEnd,
          breakTimeMin: intv.breakTimeMin,
          problemCategoryId: b.problemCategoryId,
          problemDetail: b.problemDetail || undefined,
          actionTaken: b.actionTaken || undefined,
          machineId: b.machineId.trim() || undefined,
        })
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/production/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          okQty,
          remark,
          partId,
          breakdown: finalizedBd.map(bd => ({
            breakdownStart: bd.breakdownStart,
            breakdownEnd: bd.breakdownEnd,
            breakTimeMin: bd.breakTimeMin,
            problemCategoryId: bd.problemCategoryId,
            problemDetail: bd.problemDetail ?? '',
            actionTaken: bd.actionTaken,
            machineId: bd.machineId,
          })),
          ng: ngs.map(ng => ({
            ngQty: ng.ngQty,
            problemCategoryId: ng.problemCategoryId,
            problemDetail: ng.problemDetail ?? '',
            actionTaken: ng.actionTaken,
            machineId: ng.machineId.trim() || undefined,
          })),
        }),
      })
      const text = await res.text()
      let j: any
      try {
        j = JSON.parse(text)
      } catch {
        throw new Error(text.slice(0, 120))
      }
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Update failed')
      toast.success(th ? 'บันทึกแล้ว' : 'Saved')
      onOpenChange(false)
      await onSaved()
    } catch (e: any) {
      toast.error(e.message ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const lineLabel = detail?.session?.line
    ? `${detail.session.line.lineCode ?? ''}${detail.session.line.lineName ? ` — ${detail.session.line.lineName}` : ''}`
    : ''

  const partOptions = useMemo(() => {
    const rows = [...lineTargets]
    if (detail?.part?.id && !rows.some((t: any) => t.partId === detail.part.id)) {
      rows.unshift({ partId: detail.part.id, part: detail.part })
    }
    return rows
  }, [lineTargets, detail])

  const breakdownSlotHint = useMemo(() => {
    if (!detail?.hourSlot) return ''
    const st = (detail.session?.shiftType ?? 'DAY') as 'DAY' | 'NIGHT'
    return getSlotStartTime(st, Number(detail.hourSlot))
  }, [detail?.hourSlot, detail?.session?.shiftType])

  const addBreak = () => {
    const firstMc = machines[0]?.id ?? ''
    const firstCat = catsBd[0]?.id ?? ''
    setBreaks(prev => [
      ...prev,
      {
        key: `n-${Date.now()}`,
        breakTimeMin: 10,
        problemCategoryId: firstCat,
        problemDetail: '',
        actionTaken: '',
        machineId: firstMc,
      },
    ])
  }

  const addNg = () => {
    const firstMc = machines[0]?.id ?? ''
    const firstCat = catsNg[0]?.id ?? ''
    setNgs(prev => [
      ...prev,
      {
        key: `n-${Date.now()}`,
        ngQty: 1,
        problemCategoryId: firstCat,
        problemDetail: '',
        actionTaken: '',
        machineId: firstMc,
      },
    ])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" translate="no">
        <DialogHeader>
          <DialogTitle>{th ? 'แก้ไขบันทึกรายชั่วโมง' : 'Edit hourly record'}</DialogTitle>
          <DialogDescription>
            {loading ?
              (th ? 'กำลังโหลด...' : 'Loading...')
            : detail ?
              <>
                {th ? 'ชม.' : 'Hr'} {detail.hourSlot}
                {lineLabel ? <> · {lineLabel}</> : null}
              </>
            : null}
          </DialogDescription>
        </DialogHeader>

        {loading || !detail ?
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        : (
          <div className="space-y-4 py-1">
            <div>
              <Label>{th ? 'ชิ้นงาน (Part)' : 'Part'}</Label>
              <Select value={partId} onValueChange={setPartId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={th ? 'เลือก Part' : 'Select part'} />
                </SelectTrigger>
                <SelectContent>
                  {partOptions.map((t: any) => (
                    <SelectItem key={t.partId} value={t.partId}>
                      <span className="font-mono">{t.part?.partSamco}</span>
                      {t.part?.partName ? <span className="ml-2 text-slate-600">{t.part.partName}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {partOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">{th ? 'ไม่มี Part ผูกกับสายนี้' : 'No parts on this line'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="h-edit-ok">{th ? 'OK (ชิ้น)' : 'OK qty'}</Label>
              <Input
                id="h-edit-ok"
                type="number"
                min={0}
                value={okQty}
                onChange={e => setOkQty(parseInt(e.target.value, 10) || 0)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="h-edit-rm">{th ? 'หมายเหตุ' : 'Remark'}</Label>
              <Textarea
                id="h-edit-rm"
                value={remark}
                onChange={e => setRemark(e.target.value)}
                rows={2}
                className="mt-1 resize-none"
              />
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{th ? 'Breakdown' : 'Breakdown'}</span>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addBreak}>
                  <Plus size={14} /> {th ? 'เพิ่ม' : 'Add'}
                </Button>
              </div>
              {machines.length === 0 && breaks.length > 0 && (
                <p className="mb-2 text-[11px] text-amber-700">
                  {th ? 'สายนี้ไม่มีเครื่องในระบบ — อาจบันทึก BD ไม่ได้' : 'No machines on line — BD may fail'}
                </p>
              )}
              <p className="mb-1 text-[11px] leading-snug text-slate-600">
                {th ?
                  'Breakdown: กรอกนาที (1–60) ต่อแถว และรวมทุกแถวไม่เกิน 60 นาทีต่อชั่วโมง'
                : 'Breakdown: enter 1–60 minutes per row; total must not exceed 60 minutes per hour.'}
              </p>
              {breakdownSlotHint ?
                <p className="mb-2 text-[11px] text-slate-500">
                  {th ?
                    `นาทีนับจากต้นชั่วโมงของชม. ${detail.hourSlot} (${breakdownSlotHint}) — หลายแถวต่อเนื่องกัน`
                  : `Minutes from hour ${detail.hourSlot} start (${breakdownSlotHint}); rows are consecutive.`}
                </p>
              : null}
              <div className="space-y-3">
                {breaks.length === 0 && (
                  <p className="text-xs text-slate-400">{th ? 'ไม่มีรายการ' : 'None'}</p>
                )}
                {breaks.map(bd => (
                    <div key={bd.key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-2">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-red-600"
                          onClick={() => setBreaks(prev => prev.filter(x => x.key !== bd.key))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">{th ? 'เครื่องจักร' : 'Machine'}</Label>
                          <Select value={bd.machineId} onValueChange={v => setBreaks(prev => prev.map(x => (x.key === bd.key ? { ...x, machineId: v } : x)))}>
                            <SelectTrigger className="mt-0.5 h-9 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {machines.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.mcNo} {m.mcName ? `— ${m.mcName}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">{th ? 'นาทีหยุด' : 'Downtime (min)'}</Label>
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            className="mt-0.5 h-9 text-xs"
                            value={bd.breakTimeMin}
                            onChange={e => {
                              const v = parseInt(e.target.value, 10)
                              setBreaks(prev =>
                                prev.map(x =>
                                  x.key === bd.key ?
                                    { ...x, breakTimeMin: Number.isFinite(v) ? v : 1 }
                                  : x,
                                ),
                              )
                            }}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">{th ? 'หมวดปัญหา' : 'Category'}</Label>
                          <Select
                            value={bd.problemCategoryId}
                            onValueChange={v => setBreaks(prev => prev.map(x => (x.key === bd.key ? { ...x, problemCategoryId: v } : x)))}
                          >
                            <SelectTrigger className="mt-0.5 h-9 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {catsBd.map((c: any) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.code} {c.name ? `— ${c.name}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[10px]">{th ? 'รายละเอียด' : 'Detail'}</Label>
                          <Textarea
                            className="mt-0.5 min-h-[48px] text-xs"
                            value={bd.problemDetail}
                            onChange={e => setBreaks(prev => prev.map(x => (x.key === bd.key ? { ...x, problemDetail: e.target.value } : x)))}
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">NG</span>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addNg}>
                  <Plus size={14} /> {th ? 'เพิ่ม' : 'Add'}
                </Button>
              </div>
              <div className="space-y-3">
                {ngs.length === 0 && <p className="text-xs text-slate-400">{th ? 'ไม่มีรายการ' : 'None'}</p>}
                {ngs.map(ng => (
                  <div key={ng.key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-2">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-red-600"
                        onClick={() => setNgs(prev => prev.filter(x => x.key !== ng.key))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-[10px]">{th ? 'จำนวน NG' : 'NG qty'}</Label>
                        <Input
                          type="number"
                          min={1}
                          className="mt-0.5 h-9 text-xs"
                          value={ng.ngQty}
                          onChange={e =>
                            setNgs(prev =>
                              prev.map(x =>
                                x.key === ng.key ? { ...x, ngQty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">{th ? 'เครื่องจักร' : 'Machine'}</Label>
                        <Select value={ng.machineId} onValueChange={v => setNgs(prev => prev.map(x => (x.key === ng.key ? { ...x, machineId: v } : x)))}>
                          <SelectTrigger className="mt-0.5 h-9 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {machines.map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.mcNo} {m.mcName ? `— ${m.mcName}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">{th ? 'หมวดปัญหา' : 'Category'}</Label>
                        <Select
                          value={ng.problemCategoryId}
                          onValueChange={v => setNgs(prev => prev.map(x => (x.key === ng.key ? { ...x, problemCategoryId: v } : x)))}
                        >
                          <SelectTrigger className="mt-0.5 h-9 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {catsNg.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.code} {c.name ? `— ${c.name}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">{th ? 'รายละเอียด' : 'Detail'}</Label>
                        <Textarea
                          className="mt-0.5 min-h-[48px] text-xs"
                          value={ng.problemDetail}
                          onChange={e => setNgs(prev => prev.map(x => (x.key === ng.key ? { ...x, problemDetail: e.target.value } : x)))}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {th ?
                'บันทึกครั้งนี้จะอัปเดต Part, OK, หมายเหตุ, Breakdown และ NG ตามแบบฟอร์มด้านบน'
              : 'This save updates part, OK, remark, breakdown, and NG as shown above.'}
            </p>
          </div>
        )}

        <DialogFooter className={cn('gap-2 sm:gap-0', loading && 'pointer-events-none opacity-50')}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {th ? 'ยกเลิก' : 'Cancel'}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading || !detail}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : th ? 'บันทึก' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
