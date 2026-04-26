'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Database, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CRUD_SELECT_NONE } from '@/lib/crud-select'
import {
  DASHBOARD_TABLE_BASE,
  DASHBOARD_TH_STICKY_SOFT_COMFORTABLE,
  DASHBOARD_THEAD_STICKY,
} from '@/lib/dashboard-sticky-table-classes'

export interface Column {
  key: string
  label: string
  labelEn: string
  /** class สำหรับ td (เช่น ข้อความยาวหลายบรรทัด) */
  cellClassName?: string
}

export interface Field {
  key: string
  label: string
  labelEn: string
  type: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
}

interface Props {
  title: string
  titleEn: string
  columns: Column[]
  data: any[]
  apiEndpoint: string
  fields: Field[]
  canEdit?: boolean
  /** ค่าเริ่มตอนกดเพิ่ม (เช่น isActive: 'true') */
  createDefaults?: Record<string, unknown>
  /** เรนเดอร์เซลล์เองตาม key ของคอลัมน์ (ใช้จาก client wrapper เท่านั้น) */
  columnRenders?: Record<string, (row: any) => ReactNode>
  /** ข้อความสำหรับช่องค้นหาเมื่อใช้ columnRenders */
  columnSearchText?: Record<string, (row: any) => string>
  /** แถบตัวกรองเหนือช่องค้นหา (เช่น Division / Section) */
  filterBar?: ReactNode
}

/** Radix Select ห้ามใช้ SelectItem value="" — ใช้ sentinel แล้วแปลงเป็น null ตอนส่ง API */
const SELECT_OPTION_NONE = CRUD_SELECT_NONE

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function normalizeSelectPayload(fields: Field[], data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }
  for (const f of fields) {
    if (f.type === 'select' && !f.required) {
      const v = out[f.key]
      if (v === SELECT_OPTION_NONE || v === '') out[f.key] = null
    }
  }
  return out
}

/** แปลง error จาก API (string หรือ Zod flatten) เป็นข้อความเดียว */
function messageFromApiError(body: { error?: unknown } | null): string {
  const e = body?.error
  if (typeof e === 'string') return e
  if (!e || typeof e !== 'object') return 'Request failed'
  const rec = e as { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
  if (rec.formErrors?.length) return rec.formErrors[0]!
  const fe = rec.fieldErrors
  if (fe) {
    const first = Object.values(fe).flat().find(Boolean)
    if (first) return first
  }
  return 'Request failed'
}

export function CrudPage({
  title,
  titleEn,
  columns,
  data,
  apiEndpoint,
  fields,
  canEdit = true,
  createDefaults,
  columnRenders,
  columnSearchText,
  filterBar,
}: Props) {
  const { locale } = useI18n()
  const { data: session } = useSession()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<any | null>(null)
  const [deletingRow, setDeletingRow] = useState<any | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  const t = useCallback((th: string, en: string) => locale === 'th' ? th : en, [locale])
  const displayTitle = t(title, titleEn)
  const userName = session?.user?.name ?? ''

  const filtered = data.filter(row => {
    if (!search) return true
    const q = search.toLowerCase()
    return columns.some(col => {
      const custom = columnSearchText?.[col.key]
      if (custom) return custom(row).toLowerCase().includes(q)
      const val = getNestedValue(row, col.key)
      return String(val ?? '').toLowerCase().includes(q)
    })
  })

  function openCreate() {
    setEditingRow(null)
    const base = Object.fromEntries(
      fields.map(f => {
        if (f.type === 'select' && !f.required) return [f.key, SELECT_OPTION_NONE]
        if (f.type === 'number') return [f.key, 0]
        return [f.key, '']
      }),
    ) as Record<string, unknown>
    setFormData({ ...base, ...createDefaults })
    setFormOpen(true)
  }

  function openEdit(row: any) {
    setEditingRow(row)
    setFormData(Object.fromEntries(fields.map(f => {
      let v: unknown = row[f.key] ?? ''
      if (f.type === 'select' && typeof row[f.key] === 'boolean') {
        v = row[f.key] ? 'true' : 'false'
      } else if (f.type === 'select' && !f.required && (row[f.key] === null || row[f.key] === '')) {
        v = SELECT_OPTION_NONE
      }
      return [f.key, v]
    })))
    setFormOpen(true)
  }

  function openDelete(row: any) {
    setDeletingRow(row)
    setDeleteConfirmText('')
    setDeleteOpen(true)
  }

  async function handleSubmit() {
    const isEdit = !!editingRow
    setLoading(true)
    try {
      const url = isEdit ? `${apiEndpoint}/${editingRow.id}` : apiEndpoint
      const payload = normalizeSelectPayload(fields, formData)
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(messageFromApiError(err) || `HTTP ${res.status}`)
      }
      toast.success(t(
        isEdit ? 'แก้ไขสำเร็จ' : 'เพิ่มสำเร็จ',
        isEdit ? 'Updated successfully' : 'Created successfully',
      ))
      setFormOpen(false)
      window.location.reload()
    } catch (e: any) {
      toast.error(e.message || t('เกิดข้อผิดพลาด', 'An error occurred'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deletingRow) return
    setLoading(true)
    try {
      const res = await fetch(`${apiEndpoint}/${deletingRow.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(messageFromApiError(err) || `HTTP ${res.status}`)
      }
      toast.success(t('ลบสำเร็จ', 'Deleted successfully'))
      setDeleteOpen(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || t('เกิดข้อผิดพลาด', 'An error occurred'))
    } finally {
      setLoading(false)
    }
  }

  function renderField(field: Field) {
    const fieldLabel = t(field.label, field.labelEn)
    const value = formData[field.key] ?? ''

    if (field.type === 'select' && field.options) {
      const raw = value === undefined || value === null ? '' : String(value)
      const selectVal =
        !field.required && (raw === '' || raw === 'null')
          ? SELECT_OPTION_NONE
          : raw
      return (
        <div key={field.key} className="space-y-1.5">
          <Label>{fieldLabel}{field.required && ' *'}</Label>
          <Select
            value={selectVal}
            onValueChange={v => setFormData(prev => ({ ...prev, [field.key]: v }))}
          >
            <SelectTrigger><SelectValue placeholder={`-- ${fieldLabel} --`} /></SelectTrigger>
            <SelectContent>
              {!field.required && (
                <SelectItem value={SELECT_OPTION_NONE}>—</SelectItem>
              )}
              {field.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    return (
      <div key={field.key} className="space-y-1.5">
        <Label>{fieldLabel}{field.required && ' *'}</Label>
        <Input
          type={field.type}
          value={value}
          onChange={e => setFormData(prev => ({
            ...prev,
            [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
          }))}
          required={field.required}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database size={20} className="text-blue-600" />
            {displayTitle}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} {t('รายการ', 'items')}</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            {t('เพิ่ม', 'Add')}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        {filterBar ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{filterBar}</div>
        ) : null}
        <div className="relative w-full max-w-sm sm:shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('ค้นหา...', 'Search...')}
            className="pl-9"
          />
        </div>
      </div>

      <div className="w-full min-w-0 rounded-xl bg-white border border-slate-100 shadow-sm">
        <table className={DASHBOARD_TABLE_BASE}>
          <thead className={DASHBOARD_THEAD_STICKY}>
            <tr>
              <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'w-10')}>#</th>
              {columns.map(col => (
                <th key={col.key} className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{t(col.label, col.labelEn)}</th>
              ))}
              {canEdit && (
                <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'w-24 text-right')}>{t('จัดการ', 'Actions')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (canEdit ? 2 : 1)}
                  className="border border-slate-100 py-12 text-center text-slate-400"
                >
                  {t('ไม่มีข้อมูล', 'No data')}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={row.id ?? i} className="hover:bg-slate-50 transition-colors">
                  <td className="border border-slate-100 px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                  {columns.map(col => {
                    const custom = columnRenders?.[col.key]
                    return (
                      <td
                        key={col.key}
                        className={cn('border border-slate-100 px-4 py-3 text-slate-700', col.cellClassName)}
                      >
                        {custom ? custom(row) : String(getNestedValue(row, col.key) ?? '—')}
                      </td>
                    )
                  })}
                  {canEdit && (
                    <td className="border border-slate-100 px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(row)} className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => openDelete(row)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRow ? t('แก้ไข', 'Edit') : t('เพิ่ม', 'Add')} {displayTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingRow
                ? t('แก้ไขข้อมูลในฟอร์มด้านล่างแล้วกดบันทึก', 'Edit the form below and save.')
                : t('กรอกข้อมูลในฟอร์มด้านล่างแล้วกดสร้าง', 'Fill in the form below and create.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map(renderField)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={loading}>
              {t('ยกเลิก', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              {editingRow ? t('บันทึก', 'Save') : t('เพิ่ม', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={open => { setDeleteOpen(open); if (!open) setDeleteConfirmText('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">{t('ยืนยันการลบ', 'Confirm Delete')}</DialogTitle>
            <DialogDescription>
              {t(
                'การดำเนินการนี้ไม่สามารถย้อนกลับได้ ข้อมูลที่เกี่ยวข้องทั้งหมดจะถูกลบออก',
                'This action cannot be undone. All related data will be permanently removed.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-sm text-slate-600">
              {t(
                `กรุณาพิมพ์ชื่อของคุณ '${userName}' เพื่อยืนยัน`,
                `Type your name '${userName}' to confirm`,
              )}
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={userName}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={loading}>
              {t('ยกเลิก', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || deleteConfirmText !== userName || !userName}
            >
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              {t('ลบ', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
