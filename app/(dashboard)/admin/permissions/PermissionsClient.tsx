'use client'

import { useState } from 'react'
import { PermissionEffect, PermissionScopeType, ShiftType, UserRole } from '@prisma/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n'

type PermissionRow = { key: string; name: string; resource: string | null; action: string | null }
type UserLite = { id: string; employeeCode: string; firstName: string; lastName: string; role: UserRole }
type ScopeRow = {
  id: string
  permissionKey: string
  effect: PermissionEffect
  scopeType: PermissionScopeType
  scopeValue: string | null
  targetRole: UserRole | null
  targetUser?: { employeeCode: string } | null
}
type ExceptionRow = {
  id: string
  permissionKey: string
  effect: PermissionEffect
  scopeType: PermissionScopeType
  scopeValue: string | null
  user?: { employeeCode: string } | null
}
type AuditRow = { id: string; action: string; entity?: string | null; entityId?: string | null; createdAt: string | Date }

type Props = {
  roles: UserRole[]
  permissions: PermissionRow[]
  matrix: Record<string, Record<string, PermissionEffect | null>>
  scopes: ScopeRow[]
  exceptions: ExceptionRow[]
  users: UserLite[]
  audits: AuditRow[]
}

type ModuleDef = {
  id: string
  labelTh: string
  labelEn: string
  descriptionTh: string
  descriptionEn: string
  permissionKeys: string[]
}

const MODULES: ModuleDef[] = [
  {
    id: 'production_basic',
    labelTh: 'บันทึกการผลิต',
    labelEn: 'Production Recording',
    descriptionTh: 'เข้าหน้าบันทึก และบันทึก/เปิด Session การผลิต',
    descriptionEn: 'Access record page and create/update production sessions',
    permissionKeys: ['menu.production.record', 'api.production.record.write', 'api.production.session.write'],
  },
  {
    id: 'production_reports',
    labelTh: 'ประวัติและรายงานการผลิต',
    labelEn: 'Production History & Reports',
    descriptionTh: 'เข้าหน้าประวัติ/รายงาน/MTBF และ Alerts',
    descriptionEn: 'Access history/report/MTBF pages and alerts',
    permissionKeys: ['menu.production.history', 'menu.production.report', 'menu.production.mtbf', 'menu.alerts'],
  },
  {
    id: 'master_manage',
    labelTh: 'จัดการ Master Data',
    labelEn: 'Manage Master Data',
    descriptionTh: 'แก้ไขข้อมูล master ทั้ง line/machine/part/problem/org',
    descriptionEn: 'Manage lines, machines, parts, problems, and organization data',
    permissionKeys: [
      'menu.master.lines',
      'menu.master.machines',
      'menu.master.parts',
      'menu.master.problems',
      'menu.master.departments',
      'api.master.write',
    ],
  },
  {
    id: 'admin_users',
    labelTh: 'จัดการผู้ใช้งาน',
    labelEn: 'Manage Users',
    descriptionTh: 'เข้าหน้า users และอ่าน/แก้ไขผู้ใช้งาน',
    descriptionEn: 'Access users page and read/write users',
    permissionKeys: ['menu.admin.users', 'api.admin.users.read', 'api.admin.users.write'],
  },
  {
    id: 'admin_holidays',
    labelTh: 'จัดการวันหยุด',
    labelEn: 'Manage Holidays',
    descriptionTh: 'เข้าหน้า holidays และอ่าน/แก้ไขวันหยุด',
    descriptionEn: 'Access holidays page and read/write holidays',
    permissionKeys: ['menu.admin.holidays', 'api.admin.holidays.read', 'api.admin.holidays.write'],
  },
  {
    id: 'admin_notifications',
    labelTh: 'จัดการการแจ้งเตือน',
    labelEn: 'Manage Notifications',
    descriptionTh: 'เข้าหน้า notification settings',
    descriptionEn: 'Access notification settings page',
    permissionKeys: ['menu.admin.notifications'],
  },
  {
    id: 'admin_logs',
    labelTh: 'ดู Log ระบบ',
    labelEn: 'View System Logs',
    descriptionTh: 'เข้าหน้า logs และดู audit/system/notification logs',
    descriptionEn: 'Access logs page and view audit/system/notification logs',
    permissionKeys: [
      'menu.admin.logs',
      'api.admin.logs.audit.read',
      'api.admin.logs.system.read',
      'api.admin.logs.notifications.read',
    ],
  },
  {
    id: 'admin_permissions',
    labelTh: 'จัดการสิทธิ์',
    labelEn: 'Manage Permissions',
    descriptionTh: 'เข้าหน้า permissions และจัดการสิทธิ์ระบบ',
    descriptionEn: 'Access permissions page and manage system permissions',
    permissionKeys: ['menu.admin.permissions', 'system.permissions.manage'],
  },
]

type RuleTemplateId =
  | 'operator_basic'
  | 'supervisor_standard'
  | 'engineer_full'
  | 'manager_view'
  | 'admin_full'

const RULE_TEMPLATES: { id: RuleTemplateId; labelTh: string; labelEn: string; modules: string[] }[] = [
  { id: 'operator_basic', labelTh: 'Operator พื้นฐาน', labelEn: 'Operator Basic', modules: ['production_basic'] },
  { id: 'supervisor_standard', labelTh: 'Supervisor มาตรฐาน', labelEn: 'Supervisor Standard', modules: ['production_basic', 'production_reports'] },
  { id: 'engineer_full', labelTh: 'Engineer เต็มรูปแบบ', labelEn: 'Engineer Full', modules: ['production_basic', 'production_reports', 'master_manage'] },
  { id: 'manager_view', labelTh: 'Manager มุมมองรายงาน', labelEn: 'Manager View', modules: ['production_reports', 'admin_holidays', 'admin_notifications', 'admin_logs'] },
  { id: 'admin_full', labelTh: 'Admin เต็มสิทธิ์', labelEn: 'Admin Full', modules: MODULES.map((m) => m.id) },
]

function displayName(u: UserLite): string {
  return `${u.employeeCode} - ${u.firstName} ${u.lastName}`
}

export function PermissionsClient({
  roles,
  permissions,
  matrix: initialMatrix,
  scopes: initialScopes,
  exceptions: initialExceptions,
  users,
  audits: initialAudits,
}: Props) {
  const { locale } = useI18n()
  const isTh = locale === 'th'
  const tr = (th: string, en: string) => (isTh ? th : en)

  const [selectedRole, setSelectedRole] = useState<UserRole>(roles[0] ?? UserRole.OPERATOR)
  const [selectedTemplate, setSelectedTemplate] = useState<RuleTemplateId>('operator_basic')
  const [matrix, setMatrix] = useState(initialMatrix)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [moduleState, setModuleState] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {}
    for (const mod of MODULES) {
      state[mod.id] = mod.permissionKeys.some((k) => matrix[selectedRole]?.[k] === 'ALLOW')
    }
    return state
  })

  const [scopes, setScopes] = useState<ScopeRow[]>(initialScopes)
  const [scopeTargetRole, setScopeTargetRole] = useState<UserRole>(roles[0] ?? UserRole.OPERATOR)
  const [scopeModuleId, setScopeModuleId] = useState<string>(MODULES[0]?.id ?? '')
  const [simpleScopeType, setSimpleScopeType] = useState<'ALL' | 'SECTION' | 'LINE' | 'MACHINE' | 'SHIFT'>('ALL')
  const [scopeValue, setScopeValue] = useState('')
  const [scopeShift, setScopeShift] = useState<'' | ShiftType>('')

  const [exceptions, setExceptions] = useState<ExceptionRow[]>(initialExceptions)
  const [exceptionUserId, setExceptionUserId] = useState<string>(users[0]?.id ?? '')
  const [exceptionModuleId, setExceptionModuleId] = useState<string>(MODULES[0]?.id ?? '')
  const [exceptionEffect, setExceptionEffect] = useState<PermissionEffect>(PermissionEffect.ALLOW)
  const [exceptionReason, setExceptionReason] = useState('')
  const [exceptionExpiryPreset, setExceptionExpiryPreset] = useState<'none' | '7d' | '30d'>('7d')

  const [simulateUserId, setSimulateUserId] = useState(users[0]?.id ?? '')
  const [simulateLineId, setSimulateLineId] = useState('')
  const [simulateSectionId, setSimulateSectionId] = useState('')
  const [simulateMachineId, setSimulateMachineId] = useState('')
  const [simulateShiftType, setSimulateShiftType] = useState<'' | ShiftType>('')
  const [simulationResult, setSimulationResult] = useState<{
    user: UserLite
    menus: Array<{ key: string; allowed: boolean }>
    apis: Array<{ key: string; allowed: boolean }>
  } | null>(null)

  const [audits, setAudits] = useState<AuditRow[]>(initialAudits)

  function computeRoleModuleState(role: UserRole): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    for (const mod of MODULES) {
      result[mod.id] = mod.permissionKeys.some((k) => matrix[role]?.[k] === 'ALLOW')
    }
    return result
  }

  function onRoleChange(nextRole: UserRole) {
    setSelectedRole(nextRole)
    setModuleState(computeRoleModuleState(nextRole))
  }

  function applyTemplate(templateId: RuleTemplateId) {
    setSelectedTemplate(templateId)
    const tpl = RULE_TEMPLATES.find((x) => x.id === templateId)
    if (!tpl) return
    const next: Record<string, boolean> = {}
    for (const mod of MODULES) next[mod.id] = tpl.modules.includes(mod.id)
    setModuleState(next)
  }

  async function refreshScopes() {
    const res = await fetch('/api/admin/permissions/scopes')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load scopes')
    setScopes(json.data ?? [])
  }

  async function refreshExceptions() {
    const res = await fetch('/api/admin/permissions/exceptions')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load exceptions')
    setExceptions(json.data ?? [])
  }

  async function refreshAudits() {
    const res = await fetch('/api/admin/permissions/audit?limit=80')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load audits')
    setAudits(json.data ?? [])
  }

  async function saveSimpleRole() {
    setSavingRole(selectedRole)
    try {
      const allowedKeys = new Set<string>()
      for (const mod of MODULES) {
        if (!moduleState[mod.id]) continue
        for (const key of mod.permissionKeys) allowedKeys.add(key)
      }
      const grants = permissions.map((p) => ({
        permissionKey: p.key,
        enabled: allowedKeys.has(p.key),
        effect: PermissionEffect.ALLOW,
      }))
      const res = await fetch('/api/admin/permissions/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, grants }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Save failed')

      setMatrix((prev) => {
        const next = { ...prev, [selectedRole]: { ...prev[selectedRole] } }
        for (const p of permissions) next[selectedRole][p.key] = allowedKeys.has(p.key) ? PermissionEffect.ALLOW : null
        return next
      })
      toast.success(tr(`บันทึกสิทธิ์ Role ${selectedRole} แล้ว`, `Saved permissions for role ${selectedRole}`))
      await refreshAudits()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('บันทึกไม่สำเร็จ', 'Save failed'))
    } finally {
      setSavingRole(null)
    }
  }

  async function addSimpleScope() {
    setBusy(true)
    try {
      const moduleDef = MODULES.find((m) => m.id === scopeModuleId)
      if (!moduleDef) throw new Error(tr('ไม่พบโมดูลที่เลือก', 'Selected module not found'))
      const mappedScopeType: PermissionScopeType =
        simpleScopeType === 'ALL'
          ? PermissionScopeType.GLOBAL
          : simpleScopeType === 'SECTION'
            ? PermissionScopeType.SECTION
            : simpleScopeType === 'LINE'
              ? PermissionScopeType.LINE
              : simpleScopeType === 'MACHINE'
                ? PermissionScopeType.MACHINE
                : PermissionScopeType.SHIFT
      const effectiveScopeValue = mappedScopeType === PermissionScopeType.SHIFT ? null : (scopeValue || null)

      for (const permissionKey of moduleDef.permissionKeys) {
        const res = await fetch('/api/admin/permissions/scopes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'upsert',
            scope: {
              permissionKey,
              targetRole: scopeTargetRole,
              targetUserId: null,
              scopeType: mappedScopeType,
              scopeValue: effectiveScopeValue,
              shiftType: mappedScopeType === PermissionScopeType.SHIFT ? scopeShift || null : null,
              effect: PermissionEffect.ALLOW,
              expiresAt: null,
            },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Save scope failed')
      }
      toast.success(tr('เพิ่ม Scope แล้ว', 'Scope added'))
      await Promise.all([refreshScopes(), refreshAudits()])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('บันทึก Scope ไม่สำเร็จ', 'Save scope failed'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteScope(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/permissions/scopes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'delete', id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Delete scope failed')
      toast.success(tr('ลบ Scope แล้ว', 'Scope deleted'))
      await Promise.all([refreshScopes(), refreshAudits()])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('ลบ Scope ไม่สำเร็จ', 'Delete scope failed'))
    } finally {
      setBusy(false)
    }
  }

  function computeExceptionExpiresAt(): string | null {
    if (exceptionExpiryPreset === 'none') return null
    const days = exceptionExpiryPreset === '7d' ? 7 : 30
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  }

  async function addSimpleException() {
    setBusy(true)
    try {
      const moduleDef = MODULES.find((m) => m.id === exceptionModuleId)
      if (!moduleDef) throw new Error(tr('ไม่พบโมดูลที่เลือก', 'Selected module not found'))
      const expiresAt = computeExceptionExpiresAt()
      for (const permissionKey of moduleDef.permissionKeys) {
        const res = await fetch('/api/admin/permissions/exceptions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'upsert',
            exception: {
              userId: exceptionUserId,
              permissionKey,
              effect: exceptionEffect,
              scopeType: PermissionScopeType.GLOBAL,
              scopeValue: null,
              shiftType: null,
              reason: exceptionReason || null,
              expiresAt,
            },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Save exception failed')
      }
      toast.success(tr('บันทึกสิทธิ์เฉพาะบุคคลแล้ว', 'User exception saved'))
      await Promise.all([refreshExceptions(), refreshAudits()])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('บันทึกสิทธิ์เฉพาะบุคคลไม่สำเร็จ', 'Save exception failed'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteException(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/permissions/exceptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'delete', id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Delete exception failed')
      toast.success(tr('ลบ exception แล้ว', 'Exception deleted'))
      await Promise.all([refreshExceptions(), refreshAudits()])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('ลบ exception ไม่สำเร็จ', 'Delete exception failed'))
    } finally {
      setBusy(false)
    }
  }

  async function runSimulation() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/permissions/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: simulateUserId,
          context: {
            lineId: simulateLineId || undefined,
            sectionId: simulateSectionId || undefined,
            machineId: simulateMachineId || undefined,
            shiftType: simulateShiftType || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Simulation failed')
      setSimulationResult(json.data)
      toast.success(tr('จำลองสิทธิ์เรียบร้อย', 'Simulation complete'))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('จำลองสิทธิ์ไม่สำเร็จ', 'Simulation failed'))
    } finally {
      setBusy(false)
    }
  }

  async function rollback(auditLogId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/permissions/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditLogId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Rollback failed')
      toast.success(tr('Rollback สำเร็จ', 'Rollback applied'))
      await Promise.all([refreshAudits(), refreshScopes(), refreshExceptions()])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('Rollback ไม่สำเร็จ', 'Rollback failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{tr('ตั้งค่าสิทธิ์ (โหมดง่าย)', 'Permission Settings (Simple Mode)')}</h1>
        <p className="text-sm text-slate-500">{tr('ใช้งานแบบง่าย: เลือก Rule Template, เปิด/ปิดเป็นโมดูล, เพิ่มขอบเขตและสิทธิ์ชั่วคราว', 'Simple flow: choose a rule template, toggle modules, add scope and temporary exceptions')}</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{tr('Step 1: เลือก Rule และกำหนดสิทธิ์พื้นฐาน', 'Step 1: Choose Rule and Base Permissions')}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-slate-600">{tr('บทบาท (Role)', 'Role')}</label>
            <select className="w-full rounded border border-slate-300 p-2" value={selectedRole} onChange={(e) => onRoleChange(e.target.value as UserRole)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">{tr('เทมเพลตกฎ (Rule Template)', 'Rule Template')}</label>
            <select className="w-full rounded border border-slate-300 p-2" value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value as RuleTemplateId)}>
              {RULE_TEMPLATES.map((tpl) => <option key={tpl.id} value={tpl.id}>{isTh ? tpl.labelTh : tpl.labelEn}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => void saveSimpleRole()} disabled={savingRole === selectedRole}>
              {savingRole === selectedRole ? tr('กำลังบันทึก...', 'Saving...') : tr(`บันทึก ${selectedRole}`, `Save ${selectedRole}`)}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {MODULES.map((mod) => (
            <label key={mod.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={Boolean(moduleState[mod.id])} onChange={(e) => setModuleState((prev) => ({ ...prev, [mod.id]: e.target.checked }))} className="mt-0.5" />
              <span>
                <span className="block font-medium text-slate-800">{isTh ? mod.labelTh : mod.labelEn}</span>
                <span className="block text-xs text-slate-500">{isTh ? mod.descriptionTh : mod.descriptionEn}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{tr('Step 2: Scope แบบง่าย (ตาม Role)', 'Step 2: Simple Scope (Role-based)')}</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <select className="rounded border border-slate-300 p-2" value={scopeTargetRole} onChange={(e) => setScopeTargetRole(e.target.value as UserRole)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="rounded border border-slate-300 p-2" value={scopeModuleId} onChange={(e) => setScopeModuleId(e.target.value)}>
            {MODULES.map((m) => <option key={m.id} value={m.id}>{isTh ? m.labelTh : m.labelEn}</option>)}
          </select>
          <select className="rounded border border-slate-300 p-2" value={simpleScopeType} onChange={(e) => setSimpleScopeType(e.target.value as 'ALL' | 'SECTION' | 'LINE' | 'MACHINE' | 'SHIFT')}>
            <option value="ALL">{tr('ทั้งโรงงาน', 'All factory')}</option>
            <option value="SECTION">{tr('เฉพาะ Section', 'Section only')}</option>
            <option value="LINE">{tr('เฉพาะ Line', 'Line only')}</option>
            <option value="MACHINE">{tr('เฉพาะ Machine', 'Machine only')}</option>
            <option value="SHIFT">{tr('เฉพาะ Shift', 'Shift only')}</option>
          </select>
          {simpleScopeType === 'SHIFT' ? (
            <select className="rounded border border-slate-300 p-2" value={scopeShift} onChange={(e) => setScopeShift(e.target.value as '' | ShiftType)}>
              <option value="">{tr('เลือก Shift', 'Select shift')}</option>
              <option value="DAY">{tr('กะเช้า (DAY)', 'DAY shift')}</option>
              <option value="NIGHT">{tr('กะดึก (NIGHT)', 'NIGHT shift')}</option>
            </select>
          ) : (
            <Input placeholder={tr('ใส่รหัส scope (เช่น lineId)', 'Enter scope value (e.g., lineId)')} value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} />
          )}
          <Button onClick={() => void addSimpleScope()} disabled={busy}>{tr('เพิ่ม Scope', 'Add Scope')}</Button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {scopes.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2">
              <span className="text-slate-700">{s.targetRole ?? s.targetUser?.employeeCode ?? '-'} · {s.permissionKey} · {s.scopeType}:{s.scopeValue ?? s.effect}</span>
              <Button variant="destructive" size="sm" onClick={() => void deleteScope(s.id)} disabled={busy}>{tr('ลบ', 'Delete')}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{tr('Step 3: สิทธิ์เฉพาะบุคคล (ชั่วคราว)', 'Step 3: Temporary User Exceptions')}</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <select className="rounded border border-slate-300 p-2" value={exceptionUserId} onChange={(e) => setExceptionUserId(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
          </select>
          <select className="rounded border border-slate-300 p-2" value={exceptionModuleId} onChange={(e) => setExceptionModuleId(e.target.value)}>
            {MODULES.map((m) => <option key={m.id} value={m.id}>{isTh ? m.labelTh : m.labelEn}</option>)}
          </select>
          <select className="rounded border border-slate-300 p-2" value={exceptionEffect} onChange={(e) => setExceptionEffect(e.target.value as PermissionEffect)}>
            <option value="ALLOW">{tr('Allow ชั่วคราว', 'Temporary allow')}</option>
            <option value="DENY">{tr('Deny ชั่วคราว', 'Temporary deny')}</option>
          </select>
          <select className="rounded border border-slate-300 p-2" value={exceptionExpiryPreset} onChange={(e) => setExceptionExpiryPreset(e.target.value as 'none' | '7d' | '30d')}>
            <option value="7d">{tr('หมดอายุ 7 วัน', 'Expires in 7 days')}</option>
            <option value="30d">{tr('หมดอายุ 30 วัน', 'Expires in 30 days')}</option>
            <option value="none">{tr('ไม่หมดอายุ', 'No expiry')}</option>
          </select>
          <Input placeholder={tr('เหตุผล (ไม่บังคับ)', 'Reason (optional)')} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} />
          <Button onClick={() => void addSimpleException()} disabled={busy}>{tr('บันทึก Exception', 'Save Exception')}</Button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {exceptions.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2">
              <span className="text-slate-700">{x.user?.employeeCode ?? '-'} · {x.permissionKey} · {x.effect}</span>
              <Button variant="destructive" size="sm" onClick={() => void deleteException(x.id)} disabled={busy}>{tr('ลบ', 'Delete')}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{tr('จำลองผลสิทธิ์ (Permission Simulator)', 'Permission Simulator')}</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <select className="rounded border border-slate-300 p-2" value={simulateUserId} onChange={(e) => setSimulateUserId(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
          </select>
          <Input placeholder={tr('lineId (ไม่บังคับ)', 'lineId (optional)')} value={simulateLineId} onChange={(e) => setSimulateLineId(e.target.value)} />
          <Input placeholder={tr('sectionId (ไม่บังคับ)', 'sectionId (optional)')} value={simulateSectionId} onChange={(e) => setSimulateSectionId(e.target.value)} />
          <Input placeholder={tr('machineId (ไม่บังคับ)', 'machineId (optional)')} value={simulateMachineId} onChange={(e) => setSimulateMachineId(e.target.value)} />
          <select className="rounded border border-slate-300 p-2" value={simulateShiftType} onChange={(e) => setSimulateShiftType(e.target.value as '' | ShiftType)}>
            <option value="">{tr('ทุกกะ', 'Any shift')}</option>
            <option value="DAY">{tr('กะเช้า (DAY)', 'DAY shift')}</option>
            <option value="NIGHT">{tr('กะดึก (NIGHT)', 'NIGHT shift')}</option>
          </select>
          <Button onClick={() => void runSimulation()} disabled={busy}>{tr('จำลอง', 'Run')}</Button>
        </div>
        {simulationResult ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 font-semibold">{tr('ผลลัพธ์เมนู', 'Menu Result')}</p>
              {simulationResult.menus.map((m) => (
                <div key={m.key} className="flex justify-between py-0.5">
                  <span>{m.key}</span>
                  <span className={m.allowed ? 'text-green-600' : 'text-red-600'}>{m.allowed ? 'ALLOW' : 'DENY'}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 font-semibold">{tr('ผลลัพธ์ API', 'API Result')}</p>
              {simulationResult.apis.map((a) => (
                <div key={a.key} className="flex justify-between py-0.5">
                  <span>{a.key}</span>
                  <span className={a.allowed ? 'text-green-600' : 'text-red-600'}>{a.allowed ? 'ALLOW' : 'DENY'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{tr('ประวัติการเปลี่ยนสิทธิ์และ Rollback', 'Audit & Rollback')}</h2>
          <Button variant="outline" onClick={() => void refreshAudits()} disabled={busy}>{tr('รีเฟรช', 'Refresh')}</Button>
        </div>
        <div className="space-y-2 text-sm">
          {audits.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2">
              <div>
                <p className="font-medium text-slate-800">{a.action}</p>
                <p className="text-xs text-slate-500">{a.entity ?? '-'} · {a.entityId ?? '-'} · {new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void rollback(a.id)} disabled={busy}>{tr('ย้อนกลับ (Rollback)', 'Rollback')}</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

