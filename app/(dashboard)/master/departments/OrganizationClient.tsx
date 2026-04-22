'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CrudPage } from '@/components/master/CrudPage'
import { useI18n } from '@/lib/i18n'
import { Building2, ChevronRight } from 'lucide-react'

const activeOpts = [
  { value: 'true', label: 'ใช้งาน' },
  { value: 'false', label: 'ไม่ใช้งาน' },
]

const telegramEnabledOpts = [
  { value: 'true', label: 'เปิดใช้งาน Telegram' },
  { value: 'false', label: 'ปิด Telegram ระดับฝ่าย' },
]

type Dept = {
  id: string
  departmentCode: string
  departmentName: string
  isActive: boolean
  _count?: { divisions: number }
  divisions?: {
    divisionCode: string
    divisionName: string
    isActive: boolean
    telegramEnabled: boolean
    telegramChatId: string | null
  }[]
}

type Div = {
  id: string
  divisionCode: string
  divisionName: string
  departmentId: string
  isActive: boolean
  telegramEnabled: boolean
  telegramChatId: string | null
  department: { departmentCode: string; departmentName: string }
  _count?: { sections: number }
  sections?: { sectionCode: string; sectionName: string; isActive: boolean }[]
}

type Sec = {
  id: string
  sectionCode: string
  sectionName: string
  divisionId: string
  isActive: boolean
  division: {
    divisionCode: string
    divisionName: string
    department: { departmentCode: string; departmentName: string }
  }
  _count?: { lines: number; users: number }
  lines?: { lineCode: string; lineName: string }[]
  users?: { employeeCode: string; firstName: string; lastName: string }[]
}

type TreeDept = {
  id: string
  departmentCode: string
  departmentName: string
  divisions: {
    id: string
    divisionCode: string
    divisionName: string
    sections: { id: string; sectionCode: string; sectionName: string }[]
  }[]
}

export function OrganizationClient({
  departments,
  divisions,
  sections,
  tree,
  canEdit,
}: {
  departments: Dept[]
  divisions: Div[]
  sections: Sec[]
  tree: TreeDept[]
  canEdit: boolean
}) {
  const { locale } = useI18n()
  const t = (th: string, en: string) => (locale === 'th' ? th : en)

  const fmtDivList = (
    rows: {
      divisionCode: string
      divisionName: string
      isActive: boolean
      telegramEnabled: boolean
      telegramChatId: string | null
    }[] | undefined,
  ) => {
    if (!rows?.length) return '—'
    return rows
      .map(r => {
        const off = !r.isActive ? ` (${t('ไม่ใช้งาน', 'Inactive')})` : ''
        const tg = r.telegramEnabled
          ? (r.telegramChatId?.trim() ? `TG:${r.telegramChatId}` : t('TG: fallback global', 'TG: fallback global'))
          : t('TG: disabled', 'TG: disabled')
        return `${r.divisionCode} ${r.divisionName}${off} · ${tg}`
      })
      .join(' · ')
  }

  const fmtSecList = (
    rows: { sectionCode: string; sectionName: string; isActive: boolean }[] | undefined,
  ) => {
    if (!rows?.length) return '—'
    return rows
      .map(r => {
        const off = !r.isActive ? ` (${t('ไม่ใช้งาน', 'Inactive')})` : ''
        return `${r.sectionCode} ${r.sectionName}${off}`
      })
      .join(' · ')
  }

  const fmtUsage = (s: Sec) => {
    const lineStr =
      s.lines?.length ?
        s.lines.map(l => `${l.lineCode}${l.lineName ? ` (${l.lineName})` : ''}`).join(', ')
      : t('ไม่มีสาย', 'No lines')
    const totalU = s._count?.users ?? 0
    const shown = s.users ?? []
    const previewN = 25
    const codes = shown.slice(0, previewN).map(u => u.employeeCode)
    const rest = totalU > previewN ? totalU - previewN : 0
    const userStr =
      totalU === 0 ?
        t('ไม่มี', 'None')
      : rest > 0 ?
        `${codes.join(', ')} … (+${rest} ${t('คน', 'users')})`
      : codes.join(', ')
    return `${t('สายผลิต', 'Lines')}: ${lineStr} | ${t('ผู้ใช้', 'Users')} (${totalU} ${t('คน', 'users')}): ${userStr}`
  }

  const deptRows = departments.map(d => ({
    ...d,
    statusLabel: d.isActive ? t('ใช้งาน', 'Active') : t('ไม่ใช้งาน', 'Inactive'),
    divCount: d._count?.divisions ?? 0,
    divisionsDetail: fmtDivList(d.divisions),
  }))

  const divRows = divisions.map(d => ({
    ...d,
    statusLabel: d.isActive ? t('ใช้งาน', 'Active') : t('ไม่ใช้งาน', 'Inactive'),
    telegramStatusLabel: d.telegramEnabled ? t('เปิด', 'Enabled') : t('ปิด', 'Disabled'),
    telegramChatDisplay: d.telegramChatId?.trim() || t('fallback global', 'fallback global'),
    deptLabel: `${d.department.departmentCode} ${d.department.departmentName}`,
    secCount: d._count?.sections ?? 0,
    sectionsDetail: fmtSecList(d.sections),
  }))

  const secRows = sections.map(s => ({
    ...s,
    statusLabel: s.isActive ? t('ใช้งาน', 'Active') : t('ไม่ใช้งาน', 'Inactive'),
    divLabel: `${s.division.divisionCode} ${s.division.divisionName}`,
    deptLabel: `${s.division.department.departmentCode} ${s.division.department.departmentName}`,
    usage: fmtUsage(s),
  }))

  const deptOptions = departments.map(d => ({
    value: d.id,
    label: `${d.departmentCode} — ${d.departmentName}`,
  }))

  const divOptions = divisions.map(d => ({
    value: d.id,
    label: `${d.divisionCode} — ${d.divisionName} (${d.department.departmentCode})`,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Building2 size={22} className="text-blue-600" />
          {t('โครงสร้างองค์กร', 'Organization')}
        </h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            {t('ภาพรวมโครงสร้าง', 'Structure overview')}
          </TabsTrigger>
          <TabsTrigger value="dept" className="text-xs sm:text-sm">
            {t('แผนก', 'Departments')}
          </TabsTrigger>
          <TabsTrigger value="div" className="text-xs sm:text-sm">
            {t('ฝ่าย', 'Divisions')}
          </TabsTrigger>
          <TabsTrigger value="sec" className="text-xs sm:text-sm">
            {t('ส่วน', 'Sections')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
              {t('ภาพรวมโครงสร้าง', 'Structure overview')}
            </div>
            <div className="space-y-3 p-4">
              {tree.map(dept => (
                <div key={dept.id} className="rounded-lg border border-slate-100 overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900">
                    {dept.departmentCode} — {dept.departmentName}
                  </div>
                  {dept.divisions.map(div => (
                    <div key={div.id} className="border-t border-slate-50">
                      <div className="px-4 py-2 pl-6 flex items-center gap-2 text-sm text-slate-700">
                        <ChevronRight size={14} className="text-slate-300 shrink-0" />
                        {div.divisionCode} — {div.divisionName}
                      </div>
                      {div.sections.map(sec => (
                        <div
                          key={sec.id}
                          className="px-4 py-1.5 pl-12 text-xs text-slate-500 flex items-center gap-2"
                        >
                          <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                          {sec.sectionCode} — {sec.sectionName}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dept" className="mt-4">
          <CrudPage
            title="แผนก"
            titleEn="Departments"
            apiEndpoint="/api/master/departments"
            canEdit={canEdit}
            createDefaults={{ isActive: 'true' }}
            columns={[
              { key: 'departmentCode', label: 'รหัสแผนก', labelEn: 'Dept code' },
              { key: 'departmentName', label: 'ชื่อแผนก', labelEn: 'Dept name' },
              { key: 'statusLabel', label: 'สถานะ', labelEn: 'Status' },
              {
                key: 'divCount',
                label: 'จำนวนฝ่าย',
                labelEn: '# divisions',
                cellClassName: 'whitespace-nowrap tabular-nums w-px',
              },
              {
                key: 'divisionsDetail',
                label: 'รายการฝ่าย (รหัสและชื่อ)',
                labelEn: 'Divisions (code + name)',
                cellClassName: 'max-w-[min(28rem,45vw)] text-xs text-slate-600 whitespace-normal leading-relaxed',
              },
            ]}
            data={deptRows}
            fields={[
              { key: 'departmentCode', label: 'รหัสแผนก', labelEn: 'Dept code', type: 'text', required: true },
              { key: 'departmentName', label: 'ชื่อแผนก', labelEn: 'Dept name', type: 'text', required: true },
              {
                key: 'isActive',
                label: 'สถานะ',
                labelEn: 'Status',
                type: 'select',
                options: activeOpts,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="div" className="mt-4">
          <CrudPage
            title="ฝ่าย"
            titleEn="Divisions"
            apiEndpoint="/api/master/divisions"
            canEdit={canEdit}
            createDefaults={{ isActive: 'true', telegramEnabled: 'true' }}
            columns={[
              { key: 'divisionCode', label: 'รหัสฝ่าย', labelEn: 'Division code' },
              { key: 'divisionName', label: 'ชื่อฝ่าย', labelEn: 'Division name' },
              { key: 'telegramStatusLabel', label: 'Telegram', labelEn: 'Telegram' },
              { key: 'telegramChatDisplay', label: 'Telegram Chat ID', labelEn: 'Telegram Chat ID' },
              { key: 'deptLabel', label: 'แผนก (รหัสและชื่อ)', labelEn: 'Department (code + name)' },
              { key: 'statusLabel', label: 'สถานะ', labelEn: 'Status' },
              {
                key: 'secCount',
                label: 'จำนวนส่วน',
                labelEn: '# sections',
                cellClassName: 'whitespace-nowrap tabular-nums w-px',
              },
              {
                key: 'sectionsDetail',
                label: 'รายการส่วน (รหัสและชื่อ)',
                labelEn: 'Sections (code + name)',
                cellClassName: 'max-w-[min(28rem,45vw)] text-xs text-slate-600 whitespace-normal leading-relaxed',
              },
            ]}
            data={divRows}
            fields={[
              { key: 'divisionCode', label: 'รหัสฝ่าย', labelEn: 'Division code', type: 'text', required: true },
              { key: 'divisionName', label: 'ชื่อฝ่าย', labelEn: 'Division name', type: 'text', required: true },
              {
                key: 'telegramEnabled',
                label: 'เปิดใช้งาน Telegram',
                labelEn: 'Enable Telegram',
                type: 'select',
                options: telegramEnabledOpts,
              },
              {
                key: 'telegramChatId',
                label: 'Telegram Chat ID',
                labelEn: 'Telegram Chat ID',
                type: 'text',
              },
              {
                key: 'departmentId',
                label: 'แผนก',
                labelEn: 'Department',
                type: 'select',
                required: true,
                options: deptOptions,
              },
              {
                key: 'isActive',
                label: 'สถานะ',
                labelEn: 'Status',
                type: 'select',
                options: activeOpts,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="sec" className="mt-4">
          <CrudPage
            title="ส่วน"
            titleEn="Sections"
            apiEndpoint="/api/master/sections"
            canEdit={canEdit}
            createDefaults={{ isActive: 'true' }}
            columns={[
              { key: 'sectionCode', label: 'รหัสส่วน', labelEn: 'Section code' },
              { key: 'sectionName', label: 'ชื่อส่วน', labelEn: 'Section name' },
              { key: 'divLabel', label: 'ฝ่าย (รหัสและชื่อ)', labelEn: 'Division (code + name)' },
              { key: 'deptLabel', label: 'แผนก (รหัสและชื่อ)', labelEn: 'Department (code + name)' },
              { key: 'statusLabel', label: 'สถานะ', labelEn: 'Status' },
              {
                key: 'usage',
                label: 'การใช้งาน (สายผลิต / ผู้ใช้)',
                labelEn: 'Usage (lines / users)',
                cellClassName: 'max-w-[min(36rem,55vw)] text-xs text-slate-600 whitespace-normal leading-relaxed',
              },
            ]}
            data={secRows}
            fields={[
              { key: 'sectionCode', label: 'รหัสส่วน', labelEn: 'Section code', type: 'text', required: true },
              { key: 'sectionName', label: 'ชื่อส่วน', labelEn: 'Section name', type: 'text', required: true },
              {
                key: 'divisionId',
                label: 'ฝ่าย',
                labelEn: 'Division',
                type: 'select',
                required: true,
                options: divOptions,
              },
              {
                key: 'isActive',
                label: 'สถานะ',
                labelEn: 'Status',
                type: 'select',
                options: activeOpts,
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
