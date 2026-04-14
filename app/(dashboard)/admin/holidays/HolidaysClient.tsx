'use client'

import { useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import thLocale from '@fullcalendar/core/locales/th'
import './holidays-calendar.css'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { CalendarX2, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { formatUtcCalendarDate, formatThaiDateUTCISO } from '@/lib/time-utils'
import { cn } from '@/lib/utils/cn'

const emptyForm = { date: '', name: '', description: '' }

type HolidayRow = {
  id: string
  date: string
  name: string
  description: string | null
  isActive?: boolean
}

function calendarDateToKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

function toMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function HolidaysClient({ holidays, canEdit }: { holidays: HolidayRow[]; canEdit: boolean }) {
  const { locale } = useI18n()
  const { data: sessionData } = useSession()
  const userName = sessionData?.user?.name ?? ''
  const calendarRef = useRef<FullCalendar | null>(null)

  const [month, setMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<HolidayRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [viewHoliday, setViewHoliday] = useState<HolidayRow | null>(null)

  const byDateKey = useMemo(() => {
    const m = new Map<string, HolidayRow>()
    for (const h of holidays) {
      m.set(formatThaiDateUTCISO(new Date(h.date)), h)
    }
    return m
  }, [holidays])

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2026, i, 1)
      return {
        value: String(i),
        label: new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { month: 'long' }).format(date),
      }
    })
  }, [locale])

  const yearOptions = useMemo(() => Array.from({ length: 21 }, (_, i) => 2020 + i), [])

  const calendarLocale = locale === 'th' ? thLocale : undefined

  function goToDate(nextDate: Date) {
    const next = toMonthStart(nextDate)
    setMonth(next)
    calendarRef.current?.getApi().gotoDate(next)
  }

  function handlePrevMonth() {
    goToDate(new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }

  function handleNextMonth() {
    goToDate(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }

  function handleMonthSelect(value: string) {
    goToDate(new Date(month.getFullYear(), Number(value), 1))
  }

  function handleYearSelect(value: string) {
    goToDate(new Date(Number(value), month.getMonth(), 1))
  }

  function openCreateForDate(dateKey: string) {
    setEditing(null)
    setForm({ ...emptyForm, date: dateKey })
    setOpen(true)
  }

  function openEdit(h: HolidayRow) {
    setEditing(h)
    setForm({
      date: (typeof h.date === 'string' ? h.date : new Date(h.date).toISOString()).slice(0, 10),
      name: h.name,
      description: h.description ?? '',
    })
    setOpen(true)
  }

  function handleDayClick(day: Date) {
    const key = calendarDateToKey(day)
    const existing = byDateKey.get(key)

    if (existing) {
      if (canEdit) {
        openEdit(existing)
      } else {
        setViewHoliday(existing)
      }
      return
    }

    if (!canEdit) {
      toast.info(
        locale === 'th' ? 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เพิ่มหรือแก้ไขวันหยุดได้' : 'Only administrators can add or edit holidays.'
      )
      return
    }

    openCreateForDate(key)
  }

  function refreshHolidaysPage() {
    window.location.reload()
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
      refreshHolidaysPage()
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
      refreshHolidaysPage()
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 sm:text-2xl">
          <CalendarX2 size={24} className="shrink-0 text-blue-600" />
          {locale === 'th' ? 'ปฏิทินวันหยุด' : 'Holidays Calendar'}
        </h1>
        {canEdit && (
          <Button
            onClick={() => {
              const t = new Date()
              openCreateForDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)
            }}
            size="sm"
          >
            <Plus size={16} className="mr-1" />
            {locale === 'th' ? 'เพิ่มวันหยุด' : 'Add Holiday'}
          </Button>
        )}
      </div>

      <p className="shrink-0 text-xs leading-snug text-slate-500 sm:text-sm">
        {locale === 'th'
          ? 'คลิกวันที่บนปฏิทินเพื่อดูหรือแก้ไข (ผู้ดูแลระบบเท่านั้น) — วันอาทิตย์และวันหยุดที่กำหนดจะไม่แจ้งเตือนการบันทึกขาด'
          : 'Click a date to view or edit (admins only). Sundays and listed holidays skip missing-record alerts.'}
      </p>

      <div>
        <section className="holidays-calendar-card rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:p-5">
          <div className={cn('flex flex-col')}>
            <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
              <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={handlePrevMonth}>
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <div className="flex items-center justify-center gap-2">
                <select
                  value={String(month.getMonth())}
                  onChange={e => handleMonthSelect(e.target.value)}
                  className="h-11 min-w-[9rem] rounded-md border-x border-slate-200 bg-white px-4 text-center text-2xl font-bold text-slate-900 outline-none"
                >
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={String(month.getFullYear())}
                  onChange={e => handleYearSelect(e.target.value)}
                  className="h-11 min-w-[7rem] rounded-md border-x border-slate-200 bg-white px-4 text-center text-2xl font-bold text-slate-900 outline-none"
                >
                  {yearOptions.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full" onClick={handleNextMonth}>
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>

            <div className="holidays-fc-wrap">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                initialDate={month}
                height="auto"
                contentHeight="auto"
                expandRows
                handleWindowResize
                fixedWeekCount
                showNonCurrentDates
                locale={calendarLocale}
                headerToolbar={false}
                firstDay={0}
                dayMaxEvents={false}
                dateClick={(arg: any) => handleDayClick(arg.date)}
                datesSet={(arg: any) => setMonth(toMonthStart(arg.view.currentStart))}
                dayHeaderContent={(arg: any) => {
                  const label = locale === 'th'
                    ? new Intl.DateTimeFormat('th-TH', { weekday: 'short' }).format(arg.date)
                    : new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(arg.date)
                  return label.replace('.', '')
                }}
                dayCellClassNames={(arg: any) => {
                  const key = calendarDateToKey(arg.date)
                  return [
                    'holidays-fc-day',
                    arg.isOther ? 'is-outside' : '',
                    arg.isToday ? 'is-today' : '',
                    arg.date.getDay() === 0 ? 'is-sunday' : '',
                    byDateKey.has(key) ? 'is-holiday' : '',
                  ].filter(Boolean)
                }}
                dayCellDidMount={(arg: any) => {
                  const key = calendarDateToKey(arg.date)
                  const hol = byDateKey.get(key)
                  const frame = arg.el.querySelector('.fc-daygrid-day-frame') as HTMLElement | null
                  const oldLabel = frame?.querySelector('.holidays-fc-holiday-label')
                  oldLabel?.remove()
                  if (hol && !arg.isOther) {
                    arg.el.setAttribute('data-holiday-name', hol.name)
                    arg.el.setAttribute('title', hol.name)
                    if (frame) {
                      const label = document.createElement('div')
                      label.className = 'holidays-fc-holiday-label'
                      label.textContent = hol.name
                      frame.appendChild(label)
                    }
                  } else {
                    arg.el.removeAttribute('data-holiday-name')
                  }
                }}
              />
            </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600 sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full border-2 border-blue-600" />
              {locale === 'th' ? 'วันนี้' : 'Today'}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
              {locale === 'th' ? 'วันหยุด (กำหนดเอง)' : 'Listed holiday'}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" />
              {locale === 'th' ? 'วันอาทิตย์ (หยุดประจำ)' : 'Sunday (weekly off)'}
            </span>
          </div>
          </div>
        </section>
      </div>

      {/* View-only (MANAGER) */}
      <Dialog open={!!viewHoliday} onOpenChange={o => !o && setViewHoliday(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{locale === 'th' ? 'รายละเอียดวันหยุด' : 'Holiday'}</DialogTitle>
            <DialogDescription>
              {viewHoliday
                ? formatUtcCalendarDate(new Date(viewHoliday.date), locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB')
                : ''}
            </DialogDescription>
          </DialogHeader>
          {viewHoliday && (
            <div className="space-y-2 py-2">
              <p className="font-semibold text-slate-800">{viewHoliday.name}</p>
              <p className="text-sm text-slate-600">{viewHoliday.description?.trim() ? viewHoliday.description : '—'}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewHoliday(null)}>
              {locale === 'th' ? 'ปิด' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full justify-start sm:w-auto">
              {editing ? (
                <Button variant="destructive" onClick={() => { setOpen(false); openDeleteDialog(editing.id) }}>
                  <Trash2 size={15} className="mr-1" />
                  {locale === 'th' ? 'ลบวันหยุด' : 'Delete Holiday'}
                </Button>
              ) : <span />}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={() => setOpen(false)}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึก' : 'Save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
