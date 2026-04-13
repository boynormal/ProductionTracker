'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { CalendarX2, Plus, Pencil, Trash2 } from 'lucide-react'
import { getThaiTodayUTC, formatUtcCalendarDate, formatThaiDateUTCISO } from '@/lib/time-utils'

const emptyForm = { date: '', name: '', description: '' }

export function HolidaysClient({ holidays }: { holidays: any[] }) {
  const { locale } = useI18n()
  const router = useRouter()
  const { data: sessionData } = useSession()
  const userName = sessionData?.user?.name ?? ''
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const todayUtc = getThaiTodayUTC()
  const upcoming = holidays.filter(h => new Date(h.date) >= todayUtc)
  const past = holidays.filter(h => new Date(h.date) < todayUtc)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(h: any) {
    setEditing(h)
    setForm({
      date: (typeof h.date === 'string' ? h.date : new Date(h.date).toISOString()).slice(0, 10),
      name: h.name,
      description: h.description ?? '',
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.date || !form.name) {
      toast.error(locale === 'th' ? 'กรุณากรอกวันที่และชื่อ' : 'Date and name are required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/admin/holidays/${editing.id}` : '/api/admin/holidays'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Validation error')
        return
      }

      toast.success(editing ? (locale === 'th' ? 'อัปเดตแล้ว' : 'Holiday updated') : (locale === 'th' ? 'เพิ่มแล้ว' : 'Holiday created'))
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  function openDeleteDialog(id: string) {
    setDeleteId(id)
    setDeleteConfirmText('')
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(deleteId)
    try {
      const res = await fetch(`/api/admin/holidays/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(locale === 'th' ? 'ลบแล้ว' : 'Holiday deleted')
      setDeleteOpen(false)
      router.refresh()
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarX2 size={22} className="text-blue-600" />
          {locale === 'th' ? 'ปฏิทินวันหยุด' : 'Holidays Calendar'}
        </h1>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1" />
          {locale === 'th' ? 'เพิ่มวันหยุด' : 'Add Holiday'}
        </Button>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">
          {locale === 'th' ? 'วันหยุดที่จะมาถึง' : 'Upcoming Holidays'}
          {upcoming.length > 0 && <Badge variant="secondary" className="ml-2">{upcoming.length}</Badge>}
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-100 py-8 text-center text-sm text-slate-400">
            {locale === 'th' ? 'ไม่มีวันหยุดที่กำหนดไว้' : 'No upcoming holidays'}
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'วันที่' : 'Date'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'ชื่อวันหยุด' : 'Name'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'รายละเอียด' : 'Description'}</th>
                  <th className="px-4 py-3 text-right">{locale === 'th' ? 'จัดการ' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcoming.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-800">
                      {formatUtcCalendarDate(new Date(h.date), locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB')}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{h.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{h.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(h.id)} disabled={deleting === h.id}>
                        <Trash2 size={15} className="text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 mb-2">
            {locale === 'th' ? 'วันหยุดที่ผ่านแล้ว' : 'Past Holidays'}
          </h2>
          <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'วันที่' : 'Date'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'ชื่อ' : 'Name'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'th' ? 'รายละเอียด' : 'Description'}</th>
                  <th className="px-4 py-3 text-right">{locale === 'th' ? 'จัดการ' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...past].reverse().slice(0, 20).map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors text-slate-400">
                    <td className="px-4 py-3 font-mono">
                      {formatUtcCalendarDate(new Date(h.date), locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB')}
                    </td>
                    <td className="px-4 py-3">{h.name}</td>
                    <td className="px-4 py-3 text-xs">{h.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(h.id)} disabled={deleting === h.id}>
                        <Trash2 size={15} className="text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={open => { setDeleteOpen(open); if (!open) setDeleteConfirmText('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">{locale === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}</DialogTitle>
            <DialogDescription>
              {locale === 'th' ? 'การดำเนินการนี้ไม่สามารถย้อนกลับได้' : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-sm text-slate-600">
              {locale === 'th'
                ? `กรุณาพิมพ์ชื่อของคุณ '${userName}' เพื่อยืนยัน`
                : `Type your name '${userName}' to confirm`}
            </Label>
            <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={userName} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!deleting || deleteConfirmText !== userName || !userName}>
              {locale === 'th' ? 'ลบ' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? (locale === 'th' ? 'แก้ไขวันหยุด' : 'Edit Holiday') : (locale === 'th' ? 'เพิ่มวันหยุด' : 'Add Holiday')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'วันที่' : 'Date'}</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'ชื่อวันหยุด' : 'Name'}</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Songkran" />
            </div>
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder={locale === 'th' ? 'ไม่บังคับ' : 'Optional'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึก' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
