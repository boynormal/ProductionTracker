'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { Search, Plus, Pencil, UserCheck, UserX } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { DASHBOARD_TABLE_BASE, DASHBOARD_TH_STICKY_SOFT_COMFORTABLE } from '@/lib/dashboard-sticky-table-classes'

const ROLES = ['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN'] as const
const roleBadge: Record<string, string> = {
  OPERATOR:   'bg-slate-100 text-slate-700',
  SUPERVISOR: 'bg-blue-100 text-blue-700',
  ENGINEER:   'bg-purple-100 text-purple-700',
  MANAGER:    'bg-amber-100 text-amber-700',
  ADMIN:      'bg-red-100 text-red-700',
}

const TITLES = ['นาย', 'นาง', 'นางสาว'] as const

const emptyForm = {
  employeeCode: '',
  employeeTitle: '',
  firstName: '',
  lastName: '',
  password: '',
  role: 'OPERATOR' as string,
  pin: '',
  departmentId: '',
  divisionId: '',
  sectionId: '',
  positionCode: '',
  positionName: '',
  email: '',
  capablePartIds: [] as string[],
}

interface Props {
  users: any[]
  departments: any[]
  divisions: any[]
  sections: any[]
  parts: any[]
}

export function UsersClient({ users, departments, divisions, sections, parts }: Props) {
  const { locale } = useI18n()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [roleFilter, setRole] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [partFilter, setPartFilter] = useState('')

  const filteredDivisions = useMemo(
    () => form.departmentId ? divisions.filter((d: any) => d.departmentId === form.departmentId) : [],
    [divisions, form.departmentId],
  )

  const filteredSections = useMemo(
    () => form.divisionId ? sections.filter((s: any) => s.divisionId === form.divisionId) : [],
    [sections, form.divisionId],
  )

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      u.employeeCode.toLowerCase().includes(q) ||
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q)
    return matchRole && matchSearch
  })

  const filteredPartsForPicker = useMemo(() => {
    const q = partFilter.trim().toLowerCase()
    if (!q) return parts
    return parts.filter(
      (p: any) =>
        String(p.partSamco).includes(q) ||
        (p.partNo && p.partNo.toLowerCase().includes(q)) ||
        (p.partName && p.partName.toLowerCase().includes(q)),
    )
  }, [parts, partFilter])

  function openCreate() {
    setEditing(null)
    setPartFilter('')
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(u: any) {
    setEditing(u)
    setPartFilter('')
    setForm({
      employeeCode: u.employeeCode,
      employeeTitle: u.employeeTitle ?? '',
      firstName: u.firstName,
      lastName: u.lastName,
      password: '',
      role: u.role,
      pin: u.pin ?? '',
      departmentId: u.departmentId ?? '',
      divisionId: u.divisionId ?? '',
      sectionId: u.sectionId ?? '',
      positionCode: u.positionCode ?? '',
      positionName: u.positionName ?? '',
      email: u.email ?? '',
      capablePartIds: (u.capableParts ?? []).map((c: any) => c.partId),
    })
    setOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (!payload.password && editing) delete payload.password
      if (!payload.pin) delete payload.pin
      if (!payload.departmentId) delete payload.departmentId
      if (!payload.divisionId) delete payload.divisionId
      if (!payload.sectionId) delete payload.sectionId
      if (!payload.email) delete payload.email
      if (!payload.employeeTitle) delete payload.employeeTitle
      if (!payload.positionCode) delete payload.positionCode
      if (!payload.positionName) delete payload.positionName
      payload.capablePartIds = form.capablePartIds

      const url = editing ? `/api/admin/users/${editing.id}` : '/api/admin/users'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const text = await res.text()
      let json: { error?: string | object } = {}
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        toast.error(
          locale === 'th'
            ? `บันทึกไม่สำเร็จ (HTTP ${res.status})`
            : `Save failed (HTTP ${res.status})`,
        )
        return
      }

      if (!res.ok) {
        const err = json.error
        const msg =
          typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'formErrors' in err
              ? 'Validation error'
              : locale === 'th'
                ? `บันทึกไม่สำเร็จ (${res.status})`
                : `Save failed (${res.status})`
        toast.error(msg)
        return
      }

      toast.success(editing ? 'User updated' : 'User created')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: any) {
    try {
      if (u.isActive) {
        const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast.success('User deactivated')
      } else {
        const res = await fetch(`/api/admin/users/${u.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        })
        if (!res.ok) throw new Error()
        toast.success('User activated')
      }
      router.refresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  function set(key: string, val: string) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'departmentId') {
        next.divisionId = ''
        next.sectionId = ''
      } else if (key === 'divisionId') {
        next.sectionId = ''
      }
      return next
    })
  }

  const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">
          {locale === 'th' ? 'จัดการผู้ใช้' : 'User Management'}
        </h1>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1" />
          {locale === 'th' ? 'เพิ่มผู้ใช้' : 'Add User'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={locale === 'th' ? 'ค้นหาชื่อ/รหัส...' : 'Search name/code...'}
            className="pl-9" />
        </div>
        <select value={roleFilter} onChange={e => setRole(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="all">{locale === 'th' ? 'ทุก Role' : 'All Roles'}</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="self-center text-sm text-slate-500">{filtered.length} / {users.length}</span>
      </div>

      <div className="w-full min-w-0 rounded-xl bg-white border border-slate-100 shadow-sm">
        <table className={DASHBOARD_TABLE_BASE}>
          <thead>
            <tr>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'รหัส' : 'Code'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'คำนำหน้า' : 'Title'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'ชื่อ-สกุล' : 'Name'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'ตำแหน่ง' : 'Position'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'แผนก' : 'Department'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'ฝ่าย' : 'Division'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>{locale === 'th' ? 'ส่วน' : 'Section'}</th>
              <th className={DASHBOARD_TH_STICKY_SOFT_COMFORTABLE}>Role</th>
              <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-center')}>{locale === 'th' ? 'สถานะ' : 'Status'}</th>
              <th className={cn(DASHBOARD_TH_STICKY_SOFT_COMFORTABLE, 'text-right')}>{locale === 'th' ? 'จัดการ' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="border border-slate-100 px-4 py-3 font-mono font-medium text-slate-800">{u.employeeCode}</td>
                <td className="border border-slate-100 px-4 py-3 text-xs text-slate-500">{u.employeeTitle ?? '—'}</td>
                <td className="border border-slate-100 px-4 py-3 text-slate-700">{u.firstName} {u.lastName}</td>
                <td className="border border-slate-100 px-4 py-3 text-xs text-slate-500">{u.positionName ?? '—'}</td>
                <td className="border border-slate-100 px-4 py-3 text-xs text-slate-500">{u.department?.departmentName ?? '—'}</td>
                <td className="border border-slate-100 px-4 py-3 text-xs text-slate-500">{u.division?.divisionName ?? '—'}</td>
                <td className="border border-slate-100 px-4 py-3 text-xs text-slate-500">{u.section?.sectionName ?? '—'}</td>
                <td className="border border-slate-100 px-4 py-3">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', roleBadge[u.role])}>{u.role}</span>
                </td>
                <td className="border border-slate-100 px-4 py-3 text-center">
                  <Badge variant={u.isActive ? 'success' : 'secondary'}>
                    {u.isActive ? (locale === 'th' ? 'ใช้งาน' : 'Active') : (locale === 'th' ? 'ปิดใช้งาน' : 'Inactive')}
                  </Badge>
                </td>
                <td className="border border-slate-100 px-4 py-3 text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit">
                    <Pencil size={15} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(u)}
                    title={u.isActive ? 'Deactivate' : 'Activate'}>
                    {u.isActive ? <UserX size={15} className="text-red-500" /> : <UserCheck size={15} className="text-green-500" />}
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="border border-slate-100 py-8 text-center text-sm text-slate-400">
                  {locale === 'th' ? 'ไม่พบข้อมูล' : 'No users found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (locale === 'th' ? 'แก้ไขผู้ใช้' : 'Edit User') : (locale === 'th' ? 'เพิ่มผู้ใช้' : 'Add User')}</DialogTitle>
            <DialogDescription className="sr-only">
              {locale === 'th'
                ? 'ฟอร์มจัดการบัญชีผู้ใช้ รหัสผ่าน และรุ่นที่ขึ้นงานได้'
                : 'User account form: password and allowed production parts.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Row 1: Employee Code */}
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'รหัสพนักงาน' : 'Employee Code'}</Label>
              <Input value={form.employeeCode} onChange={e => set('employeeCode', e.target.value)}
                disabled={!!editing} placeholder="EMP001" />
            </div>

            {/* Row 2: Title + First + Last */}
            <div className="grid grid-cols-[100px_1fr_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'คำนำหน้า' : 'Title'}</Label>
                <select value={form.employeeTitle} onChange={e => set('employeeTitle', e.target.value)} className={selectCls}>
                  <option value="">—</option>
                  {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'ชื่อ' : 'First Name'}</Label>
                <Input value={form.firstName} onChange={e => set('firstName', e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'นามสกุล' : 'Last Name'}</Label>
                <Input value={form.lastName} onChange={e => set('lastName', e.target.value)} />
              </div>
            </div>

            {/* Row 3: Department → Division → Section (cascading) */}
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'แผนก' : 'Department'}</Label>
              <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)} className={selectCls}>
                <option value="">{locale === 'th' ? '— เลือกแผนก —' : '— Select —'}</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.departmentCode} — {d.departmentName}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'ฝ่ายงาน' : 'Division'}</Label>
                <select value={form.divisionId} onChange={e => set('divisionId', e.target.value)}
                  className={selectCls} disabled={!form.departmentId}>
                  <option value="">{locale === 'th' ? '— เลือกฝ่ายงาน —' : '— Select —'}</option>
                  {filteredDivisions.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.divisionCode} — {d.divisionName}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'หน่วยงาน' : 'Section'}</Label>
                <select value={form.sectionId} onChange={e => set('sectionId', e.target.value)}
                  className={selectCls} disabled={!form.divisionId}>
                  <option value="">{locale === 'th' ? '— เลือกหน่วยงาน —' : '— Select —'}</option>
                  {filteredSections.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.sectionCode} — {s.sectionName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 4: Position Code + Position Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'รหัสตำแหน่ง' : 'Position Code'}</Label>
                <Input value={form.positionCode} onChange={e => set('positionCode', e.target.value)} placeholder="JG01" />
              </div>
              <div className="grid gap-1.5">
                <Label>{locale === 'th' ? 'ชื่อตำแหน่ง' : 'Position Name'}</Label>
                <Input value={form.positionName} onChange={e => set('positionName', e.target.value)} placeholder="Operator" />
              </div>
            </div>

            {/* Row 5: Role + PIN */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <select value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>PIN (4 {locale === 'th' ? 'หลัก' : 'digits'})</Label>
                <Input value={form.pin} onChange={e => set('pin', e.target.value)} maxLength={4} placeholder="1234" />
              </div>
            </div>

            {/* Row 6: Password */}
            <div className="grid gap-1.5">
              <Label>{locale === 'th' ? 'รหัสผ่าน' : 'Password'}{editing && ` (${locale === 'th' ? 'เว้นว่างถ้าไม่เปลี่ยน' : 'leave blank to keep'})`}</Label>
              <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} />
            </div>

            {/* Row 7: Email */}
            <div className="grid gap-1.5">
              <Label>Email ({locale === 'th' ? 'ไม่บังคับ' : 'optional'})</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@example.com" />
            </div>

            {/* Capable parts — ว่าง = ขึ้นงานได้ทุกรุ่น */}
            <div className="grid gap-1.5 border-t border-slate-100 pt-4">
              <Label>
                {locale === 'th'
                  ? 'รุ่นที่ขึ้นงานได้ (ว่าง = ทุกรุ่น)'
                  : 'Allowed parts (empty = all parts)'}
              </Label>
              <p className="text-xs text-slate-500">
                {locale === 'th'
                  ? 'ใช้กรองรายชื่อผู้ลงชื่อบันทึกในหน้าบันทึกการผลิตตาม Part ที่เลือก'
                  : 'Filters who can be selected as record signer on production entry by part.'}
              </p>
              <Input
                value={partFilter}
                onChange={e => setPartFilter(e.target.value)}
                placeholder={locale === 'th' ? 'ค้นหา SAMCO / ชื่อรุ่น...' : 'Search SAMCO / part name...'}
                className="text-sm"
              />
              <div className="max-h-40 overflow-y-auto rounded-md border border-input p-2 space-y-1.5">
                {filteredPartsForPicker.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 text-center">{locale === 'th' ? 'ไม่พบรุ่น' : 'No parts'}</p>
                ) : (
                  filteredPartsForPicker.map((p: any) => {
                    const checked = form.capablePartIds.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        className="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setForm(f => ({
                              ...f,
                              capablePartIds: checked
                                ? f.capablePartIds.filter(id => id !== p.id)
                                : [...f.capablePartIds, p.id],
                            }))
                          }}
                          className="mt-1 rounded"
                        />
                        <span className="tabular-nums font-medium text-slate-700">{p.partSamco}</span>
                        <span className="text-slate-600 break-words">{p.partName}</span>
                      </label>
                    )
                  })
                )}
              </div>
              {form.capablePartIds.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setForm(f => ({ ...f, capablePartIds: [] }))}
                >
                  {locale === 'th' ? 'ล้างรายการ (ใช้ได้ทุกรุ่น)' : 'Clear (allow all parts)'}
                </button>
              )}
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
