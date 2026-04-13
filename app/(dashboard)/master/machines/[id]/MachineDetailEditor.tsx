'use client'

import { useState, useEffect, useCallback, useRef, type ChangeEvent, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Loader2, Trash2, Star, UploadCloud } from 'lucide-react'
import { MACHINE_IMAGE_MAX_COUNT } from '@/lib/machine-image-config'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

type LineRow = { id: string; lineCode: string; lineName: string }

export type MachineImageRow = {
  id: string
  url: string
  caption: string | null
  sortOrder: number
  isPrimary: boolean
}

type MachineRow = Record<string, unknown> & {
  id: string
  mcNo: string
  mcName: string
  lineId: string
}

function toYmd(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return ''
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function numStr(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v)
}

type FormState = {
  mcNo: string
  mcName: string
  lineId: string
  mcType: string
  department: string
  process: string
  sheetRef: string
  assetCode: string
  serialNo: string
  brand: string
  modelNo: string
  manufacturerYear: string
  location: string
  powerKW: string
  weightKg: string
  dimensions: string
  voltage: string
  frequency: string
  maintenanceIntervalDays: string
  responsiblePerson: string
  pmGeneralNote: string
  pmMajorNote: string
  conditionRating: string
  remark: string
  isActive: boolean
  purchaseDate: string
  installDate: string
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  warrantyExpiry: string
}

function machineToForm(m: MachineRow): FormState {
  return {
    mcNo: str(m.mcNo),
    mcName: str(m.mcName),
    lineId: str(m.lineId),
    mcType: str(m.mcType),
    department: str(m.department),
    process: str(m.process),
    sheetRef: str(m.sheetRef),
    assetCode: str(m.assetCode),
    serialNo: str(m.serialNo),
    brand: str(m.brand),
    modelNo: str(m.modelNo),
    manufacturerYear: numStr(m.manufacturerYear),
    location: str(m.location),
    powerKW: numStr(m.powerKW),
    weightKg: numStr(m.weightKg),
    dimensions: str(m.dimensions),
    voltage: str(m.voltage),
    frequency: str(m.frequency),
    maintenanceIntervalDays: numStr(m.maintenanceIntervalDays),
    responsiblePerson: str(m.responsiblePerson),
    pmGeneralNote: str(m.pmGeneralNote),
    pmMajorNote: str(m.pmMajorNote),
    conditionRating: m.conditionRating != null ? String(m.conditionRating) : '',
    remark: str(m.remark),
    isActive: m.isActive !== false,
    purchaseDate: toYmd(m.purchaseDate),
    installDate: toYmd(m.installDate),
    lastMaintenanceDate: toYmd(m.lastMaintenanceDate),
    nextMaintenanceDate: toYmd(m.nextMaintenanceDate),
    warrantyExpiry: toYmd(m.warrantyExpiry),
  }
}

function parseOptInt(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

function parseOptFloat(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function formToPayload(f: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    mcNo: f.mcNo.trim(),
    mcName: f.mcName.trim(),
    lineId: f.lineId,
    mcType: f.mcType.trim() || null,
    department: f.department.trim() || null,
    process: f.process.trim() || null,
    sheetRef: f.sheetRef.trim() || null,
    assetCode: f.assetCode.trim() || null,
    serialNo: f.serialNo.trim() || null,
    brand: f.brand.trim() || null,
    modelNo: f.modelNo.trim() || null,
    manufacturerYear: parseOptInt(f.manufacturerYear),
    location: f.location.trim() || null,
    powerKW: parseOptFloat(f.powerKW),
    weightKg: parseOptFloat(f.weightKg),
    dimensions: f.dimensions.trim() || null,
    voltage: f.voltage.trim() || null,
    frequency: f.frequency.trim() || null,
    maintenanceIntervalDays: parseOptInt(f.maintenanceIntervalDays),
    responsiblePerson: f.responsiblePerson.trim() || null,
    pmGeneralNote: f.pmGeneralNote.trim() || null,
    pmMajorNote: f.pmMajorNote.trim() || null,
    remark: f.remark.trim() || null,
    isActive: f.isActive,
    purchaseDate: f.purchaseDate || null,
    installDate: f.installDate || null,
    lastMaintenanceDate: f.lastMaintenanceDate || null,
    nextMaintenanceDate: f.nextMaintenanceDate || null,
    warrantyExpiry: f.warrantyExpiry || null,
  }
  const cr = parseOptInt(f.conditionRating)
  payload.conditionRating = cr != null && cr >= 1 && cr <= 5 ? cr : null
  return payload
}

const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-200'
const textareaCls =
  'min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-200'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function filterImageFiles(list: Iterable<File>): File[] {
  return Array.from(list).filter(f => {
    if (ALLOWED_IMAGE_TYPES.has(f.type)) return true
    return /\.(jpe?g|png|webp)$/i.test(f.name)
  })
}

function MachineImagesPanel({
  machineId,
  images,
  onRefresh,
}: {
  machineId: string
  images: MachineImageRow[]
  onRefresh: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [setPrimaryOnUpload, setSetPrimaryOnUpload] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const atLimit = images.length >= MACHINE_IMAGE_MAX_COUNT

  async function uploadFiles(rawFiles: File[]) {
    if (atLimit) {
      toast.error(`ครบ ${MACHINE_IMAGE_MAX_COUNT} รูปแล้ว — ลบรูปก่อนเพิ่ม`)
      return
    }
    const files = filterImageFiles(rawFiles)
    if (files.length === 0) {
      toast.error('ใช้ได้เฉพาะไฟล์รูป JPEG, PNG, WebP')
      return
    }
    const slots = MACHINE_IMAGE_MAX_COUNT - images.length
    const toUpload = files.slice(0, slots)
    if (files.length > toUpload.length) {
      toast.info(`เหลือช่อง ${slots} รูป — อัปโหลดเฉพาะ ${slots} ไฟล์แรก`)
    }

    setUploading(true)
    setUploadProgress({ current: 0, total: toUpload.length })
    let ok = 0
    let fail = 0
    let lastErr = ''
    try {
      for (let i = 0; i < toUpload.length; i++) {
        setUploadProgress({ current: i + 1, total: toUpload.length })
        const file = toUpload[i]
        const fd = new FormData()
        fd.append('file', file)
        if (caption.trim()) fd.append('caption', caption.trim().slice(0, 200))
        if (setPrimaryOnUpload && i === 0) fd.append('setPrimary', 'true')
        const res = await fetch(`/api/master/machines/${machineId}/images`, { method: 'POST', body: fd })
        const json = await res.json().catch(() => ({}))
        if (res.ok) ok++
        else {
          fail++
          if (typeof json.error === 'string') lastErr = json.error
        }
      }
      if (ok > 0) {
        setCaption('')
        setSetPrimaryOnUpload(false)
        onRefresh()
      }
      if (ok > 0 && fail === 0) toast.success(`อัปโหลดสำเร็จ ${ok} รูป`)
      else if (ok > 0 && fail > 0)
        toast.warning(`อัปโหลดได้ ${ok} รูป, ไม่สำเร็จ ${fail} ไฟล์${lastErr ? ` — ${lastErr}` : ''}`)
      else toast.error(lastErr || 'อัปโหลดไม่สำเร็จ')
    } catch {
      toast.error('Network error')
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (atLimit || uploading) return
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  async function handleDelete(imageId: string) {
    if (!window.confirm('ลบรูปนี้?')) return
    setBusyId(imageId)
    try {
      const res = await fetch(`/api/master/machines/${machineId}/images/${imageId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'ลบไม่สำเร็จ')
        return
      }
      toast.success('ลบรูปแล้ว')
      onRefresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetPrimary(imageId: string) {
    setBusyId(imageId)
    try {
      const res = await fetch(`/api/master/machines/${machineId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'อัปเดตไม่สำเร็จ')
        return
      }
      toast.success('ตั้งเป็นรูปหลักแล้ว')
      onRefresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
      <p className="text-xs font-semibold text-blue-700">รูปภาพเครื่อง (สูงสุด {MACHINE_IMAGE_MAX_COUNT} รูป)</p>

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map(img => (
            <li key={img.id} className="relative overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="aspect-[4/3] w-full bg-slate-100">
                <img src={img.url} alt={img.caption ?? ''} className="h-full w-full object-cover" />
              </div>
              {img.caption ? (
                <p className="truncate px-1.5 py-0.5 text-[10px] text-slate-600">{img.caption}</p>
              ) : null}
              <div className="flex flex-wrap gap-1 border-t border-slate-100 p-1">
                {!img.isPrimary ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-[10px] px-1"
                    disabled={busyId === img.id}
                    onClick={() => handleSetPrimary(img.id)}
                  >
                    <Star size={12} className="mr-0.5" />
                    หลัก
                  </Button>
                ) : (
                  <span className="flex flex-1 items-center justify-center rounded border border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-800">
                    รูปหลัก
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-red-600 hover:bg-red-50 px-1.5"
                  disabled={busyId === img.id}
                  onClick={() => handleDelete(img.id)}
                  aria-label="ลบรูป"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">ยังไม่มีรูป — อัปโหลดด้านล่าง</p>
      )}

      <div className="space-y-2 border-t border-slate-200 pt-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={atLimit || uploading}
          onChange={e => {
            const list = e.target.files
            if (list?.length) uploadFiles(Array.from(list))
            e.target.value = ''
          }}
        />
        <div className="grid gap-1">
          <Label className="text-xs">คำอธิบายรูป (ไม่บังคับ — ใช้กับทุกไฟล์ในรอบนี้)</Label>
          <Input
            className={inputCls}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="เช่น ด้านหน้าเครื่อง"
            disabled={atLimit || uploading}
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={setPrimaryOnUpload}
            onChange={e => setSetPrimaryOnUpload(e.target.checked)}
            className="rounded"
            disabled={atLimit || uploading}
          />
          ตั้งรูปแรกของชุดนี้เป็นรูปหลัก
        </label>

        <button
          type="button"
          disabled={atLimit || uploading}
          onClick={() => fileRef.current?.click()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
            atLimit || uploading
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'cursor-pointer border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50/40',
            isDragging && !atLimit && !uploading && 'border-blue-500 bg-blue-50 ring-2 ring-blue-200',
          )}
        >
          <span className="pointer-events-none flex flex-col items-center gap-2">
            {uploading ? (
              <>
                <Loader2 size={28} className="animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  กำลังอัปโหลด
                  {uploadProgress
                    ? ` ${uploadProgress.current}/${uploadProgress.total}`
                    : ''}
                  …
                </span>
              </>
            ) : (
              <>
                <UploadCloud size={28} className={isDragging ? 'text-blue-600' : 'text-slate-400'} />
                <span className="text-sm font-medium">
                  ลากวางรูปที่นี่ หรือคลิกเลือกหลายไฟล์
                </span>
                <span className="text-xs text-slate-500">
                  JPEG, PNG, WebP — สูงสุด {MACHINE_IMAGE_MAX_COUNT} รูปต่อเครื่อง
                  {!atLimit && images.length > 0
                    ? ` (เหลืออีก ${MACHINE_IMAGE_MAX_COUNT - images.length} ช่อง)`
                    : ''}
                </span>
              </>
            )}
          </span>
        </button>

        {atLimit ? <p className="text-[11px] text-amber-700">ครบ {MACHINE_IMAGE_MAX_COUNT} รูปแล้ว — ลบรูปก่อนเพิ่ม</p> : null}
      </div>
    </div>
  )
}

export function MachineDetailEditor({
  machineId,
  lines,
  initialMachine,
  initialImages = [],
}: {
  machineId: string
  lines: LineRow[]
  initialMachine: MachineRow
  initialImages?: MachineImageRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(() => machineToForm(initialMachine))

  const sync = useCallback(() => {
    setForm(machineToForm(initialMachine))
  }, [initialMachine])

  useEffect(() => {
    if (open) sync()
  }, [open, sync])

  const set =
    (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      setForm(f => ({ ...f, [key]: v as never }))
    }

  async function handleSave() {
    if (!form.mcNo.trim() || !form.mcName.trim() || !form.lineId) {
      toast.error('กรอกรหัสเครื่อง ชื่อเครื่อง และสายให้ครบ')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/master/machines/${machineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(form)),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'บันทึกไม่สำเร็จ')
        return
      }
      toast.success('อัปเดตข้อมูลเครื่องแล้ว')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pencil size={14} />
        แก้ไข / Edit
      </Button>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) sync() }}>
        <DialogContent className="max-h-[min(92vh,900px)] w-full max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขรายละเอียดเครื่องจักร</DialogTitle>
            <DialogDescription className="sr-only">
              อัปเดตข้อมูล Master เครื่องจักร บันทึกผ่าน API
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>รหัสเครื่อง (mcNo) *</Label>
                <Input className={inputCls} value={form.mcNo} onChange={set('mcNo')} />
              </div>
              <div className="grid gap-1">
                <Label>ชื่อเครื่อง *</Label>
                <Input className={inputCls} value={form.mcName} onChange={set('mcName')} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>สายการผลิต *</Label>
              <select className={inputCls} value={form.lineId} onChange={set('lineId')}>
                <option value="">— เลือกสาย —</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.lineCode} — {l.lineName}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="rounded" />
              ใช้งาน (Active)
            </label>

            <MachineImagesPanel machineId={machineId} images={initialImages} onRefresh={() => router.refresh()} />

            <p className="text-xs font-semibold text-blue-700 pt-2">ข้อมูลทั่วไป</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>ประเภท (Type)</Label>
                <Input className={inputCls} value={form.mcType} onChange={set('mcType')} />
              </div>
              <div className="grid gap-1">
                <Label>แผนก</Label>
                <Input className={inputCls} value={form.department} onChange={set('department')} />
              </div>
              <div className="grid gap-1">
                <Label>Process</Label>
                <Input className={inputCls} value={form.process} onChange={set('process')} />
              </div>
              <div className="grid gap-1">
                <Label>Sheet ref</Label>
                <Input className={inputCls} value={form.sheetRef} onChange={set('sheetRef')} />
              </div>
              <div className="grid gap-1">
                <Label>Asset Code</Label>
                <Input className={inputCls} value={form.assetCode} onChange={set('assetCode')} />
              </div>
              <div className="grid gap-1">
                <Label>Serial No.</Label>
                <Input className={inputCls} value={form.serialNo} onChange={set('serialNo')} />
              </div>
              <div className="grid gap-1">
                <Label>Brand</Label>
                <Input className={inputCls} value={form.brand} onChange={set('brand')} />
              </div>
              <div className="grid gap-1">
                <Label>Model</Label>
                <Input className={inputCls} value={form.modelNo} onChange={set('modelNo')} />
              </div>
              <div className="grid gap-1">
                <Label>ปีผลิต</Label>
                <Input className={inputCls} value={form.manufacturerYear} onChange={set('manufacturerYear')} inputMode="numeric" />
              </div>
              <div className="grid gap-1">
                <Label>Location</Label>
                <Input className={inputCls} value={form.location} onChange={set('location')} />
              </div>
            </div>

            <p className="text-xs font-semibold text-blue-700 pt-2">สเปก</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>Power (kW)</Label>
                <Input className={inputCls} value={form.powerKW} onChange={set('powerKW')} inputMode="decimal" />
              </div>
              <div className="grid gap-1">
                <Label>Weight (kg)</Label>
                <Input className={inputCls} value={form.weightKg} onChange={set('weightKg')} inputMode="decimal" />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label>Dimensions</Label>
                <Input className={inputCls} value={form.dimensions} onChange={set('dimensions')} />
              </div>
              <div className="grid gap-1">
                <Label>Voltage</Label>
                <Input className={inputCls} value={form.voltage} onChange={set('voltage')} />
              </div>
              <div className="grid gap-1">
                <Label>Frequency</Label>
                <Input className={inputCls} value={form.frequency} onChange={set('frequency')} />
              </div>
              <div className="grid gap-1">
                <Label>สภาพ (1–5)</Label>
                <Input className={inputCls} value={form.conditionRating} onChange={set('conditionRating')} inputMode="numeric" placeholder="1-5" />
              </div>
            </div>

            <p className="text-xs font-semibold text-blue-700 pt-2">วันที่</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>ซื้อ (Purchase)</Label>
                <Input className={inputCls} type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
              </div>
              <div className="grid gap-1">
                <Label>ติดตั้ง (Install)</Label>
                <Input className={inputCls} type="date" value={form.installDate} onChange={set('installDate')} />
              </div>
              <div className="grid gap-1">
                <Label>Warranty หมด</Label>
                <Input className={inputCls} type="date" value={form.warrantyExpiry} onChange={set('warrantyExpiry')} />
              </div>
            </div>

            <p className="text-xs font-semibold text-blue-700 pt-2">PM</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>รอบ PM (วัน)</Label>
                <Input className={inputCls} value={form.maintenanceIntervalDays} onChange={set('maintenanceIntervalDays')} inputMode="numeric" />
              </div>
              <div className="grid gap-1">
                <Label>PM ล่าสุด</Label>
                <Input className={inputCls} type="date" value={form.lastMaintenanceDate} onChange={set('lastMaintenanceDate')} />
              </div>
              <div className="grid gap-1">
                <Label>PM ถัดไป</Label>
                <Input className={inputCls} type="date" value={form.nextMaintenanceDate} onChange={set('nextMaintenanceDate')} />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label>ผู้รับผิดชอบ</Label>
                <Input className={inputCls} value={form.responsiblePerson} onChange={set('responsiblePerson')} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>PM General Note</Label>
              <textarea className={textareaCls} value={form.pmGeneralNote} onChange={set('pmGeneralNote')} />
            </div>
            <div className="grid gap-1">
              <Label>PM Major Note</Label>
              <textarea className={textareaCls} value={form.pmMajorNote} onChange={set('pmMajorNote')} />
            </div>

            <div className="grid gap-1">
              <Label>Remark</Label>
              <textarea className={textareaCls} value={form.remark} onChange={set('remark')} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
