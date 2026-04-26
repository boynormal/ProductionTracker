/**
 * นำเข้าแผนก / ฝ่าย / Section / ผู้ใช้ จาก docs/พนักงาน.xlsx
 *
 * คอลัมน์องค์กรให้สอดคล้องแผ่น "พนักงาน" (ไทยหรืออังกฤษ):
 *   ชื่อแผนก, รหัสฝ่าย, ชื่อฝ่าย, รหัสส่วน, ชื่อส่วน
 *   รหัสแผนก — ถ้ามีในไฟล์ใช้ตามนั้น; ถ้าไม่มี สคริปต์สร้างรหัสจากชื่อแผนก (ชื่อเดียวกันในไฟล์ได้รหัสเดียวกันในรอบนำเข้า)
 *
 * รองรับหัวคอลัมน์แบบมีชื่อฟิลด์ (แถวหัวตรวจอัตโนมัติภายใน ~20 แถวแรก) เช่น department_name, division_code, …
 *
 * รองรับแบบเดิม (แถวข้อมูลเริ่ม index 3, คอลัมน์ตายตัว) หากไม่พบหัวแบบด้านบน
 *
 * Run:
 *   npm run db:import-employees
 *   npm run db:import-employees -- path/to/พนักงาน.xlsx
 */

import { PrismaClient, UserRole } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as bcrypt from 'bcryptjs'
import * as path from 'path'
import * as fs from 'fs'
import { canonicalDivisionName } from '../lib/org-display'

const prisma = new PrismaClient()

const DEFAULT_PATH = path.join(__dirname, '../docs/พนักงาน.xlsx')

/** แปลงหัวคอลัมน์ → คีย์ภายใน */
function normHeader(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u0E00-\u0E7F_]/g, '')
}

type ColKey =
  | 'department_code'
  | 'department_name'
  | 'division_code'
  | 'division_name'
  | 'section_code'
  | 'section_name'
  | 'employee_code'
  | 'employee_title'
  | 'first_name'
  | 'last_name'
  | 'position_code'
  | 'position_name'

const HEADER_SYNONYMS: Record<ColKey, string[]> = {
  department_code: ['department_code', 'dept_code', 'รหัสแผนก'],
  department_name: ['department_name', 'dept_name', 'ชื่อแผนก'],
  division_code: ['division_code', 'div_code', 'รหัสฝ่าย'],
  division_name: ['division_name', 'div_name', 'ชื่อฝ่าย'],
  section_code: ['section_code', 'sec_code', 'รหัสส่วน'],
  section_name: ['section_name', 'sec_name', 'ชื่อส่วน'],
  employee_code: ['employee_code', 'emp_code', 'รหัสพนักงาน', 'รหัส'],
  employee_title: ['employee_title', 'title', 'คำนำหน้า'],
  first_name: ['first_name', 'firstname', 'ชื่อ'],
  last_name: ['last_name', 'lastname', 'นามสกุล'],
  position_code: ['position_code', 'pos_code', 'รหัสตำแหน่ง'],
  position_name: ['position_name', 'pos_name', 'ชื่อตำแหน่ง'],
}

function makeDeptCodeFromName(name: string): string {
  const s = name.trim()
  if (!s) return ''
  const lead = s.match(/^([\d]{2}-[\d]{3}|[\d-]+)/)
  if (lead) return lead[1].slice(0, 30)
  const slug = s
    .replace(/[^\w\u0E00-\u0E7F.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  return slug || `D-${Math.random().toString(36).slice(2, 10)}`
}

function mapHeaderRow(row: unknown[]): Partial<Record<ColKey, number>> | null {
  const cells = row.map(c => normHeader(c))
  const out: Partial<Record<ColKey, number>> = {}
  for (const key of Object.keys(HEADER_SYNONYMS) as ColKey[]) {
    const syns = HEADER_SYNONYMS[key]
    for (let i = 0; i < cells.length; i++) {
      const h = cells[i]
      if (syns.some(s => h === s || h.endsWith('_' + s) || h === s.replace(/_/g, ''))) {
        out[key] = i
        break
      }
    }
  }
  const hasOrg =
    out.division_code !== undefined &&
    (out.section_code !== undefined || out.section_name !== undefined) &&
    (out.department_code !== undefined || out.department_name !== undefined)
  const hasEmp = out.employee_code !== undefined
  if (hasOrg || hasEmp) return out
  return null
}

function findHeaderAndMap(raw: unknown[][]): {
  col: Partial<Record<ColKey, number>>
  dataRows: unknown[][]
  legacyFixed: boolean
} {
  const LEGACY_COL: Partial<Record<ColKey, number>> = {
    employee_code: 1,
    employee_title: 2,
    first_name: 3,
    last_name: 4,
    department_code: 5,
    department_name: 6,
    division_code: 7,
    division_name: 8,
    section_code: 9,
    section_name: 10,
    position_code: 11,
    position_name: 12,
  }

  for (let i = 0; i < Math.min(22, raw.length); i++) {
    const row = raw[i] as unknown[]
    const m = mapHeaderRow(row)
    if (m && (m.division_code !== undefined || m.employee_code !== undefined)) {
      const merged: Partial<Record<ColKey, number>> = { ...m }
      for (const k of Object.keys(LEGACY_COL) as ColKey[]) {
        if (merged[k] === undefined && LEGACY_COL[k] !== undefined) merged[k] = LEGACY_COL[k]
      }
      return { col: merged, dataRows: raw.slice(i + 1), legacyFixed: false }
    }
  }
  return {
    col: {},
    dataRows: raw.slice(3),
    legacyFixed: true,
  }
}

function cell(
  r: unknown[],
  col: Partial<Record<ColKey, number>>,
  key: ColKey,
  legacyIdx: number,
  legacy: boolean,
): string {
  if (legacy) return String(r[legacyIdx] ?? '').trim()
  const i = col[key]
  if (i === undefined) return ''
  return String(r[i] ?? '').trim()
}

function mapRole(posCode: string): UserRole {
  const g = parseInt(posCode || '0', 10)
  if (g >= 10) return 'ADMIN'
  if (g >= 8)  return 'MANAGER'
  if (g === 7) return 'ENGINEER'
  if (g >= 4)  return 'SUPERVISOR'
  return 'OPERATOR'
}

async function main() {
  const filePath = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : DEFAULT_PATH

  if (!fs.existsSync(filePath)) {
    console.error(`❌ ไม่พบไฟล์: ${filePath}`)
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets['พนักงาน']
  if (!ws) {
    console.error('❌ ไม่พบแผ่นงานชื่อ "พนักงาน" ในไฟล์')
    process.exit(1)
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const { col, dataRows, legacyFixed } = findHeaderAndMap(raw)

  if (!legacyFixed) {
    console.log('   ℹ️  ตรวจพบหัวคอลัมน์แบบมีชื่อฟิลด์ (เช่น department_name, division_code, …)')
  } else {
    console.log('   ℹ️  ใช้รูปแบบคอลัมน์ตายตัวแบบเดิม (แถวข้อมูลเริ่มแถวที่ 4)')
  }

  const nameToDeptCode = new Map<string, string>()

  function deptCodeForRow(dc: string, dn: string): string {
    const c = dc.trim()
    if (c) return c
    const n = dn.trim()
    if (!n) return ''
    if (!nameToDeptCode.has(n)) nameToDeptCode.set(n, makeDeptCodeFromName(n))
    return nameToDeptCode.get(n)!
  }

  type OrgItem = { code: string; name: string }
  const deptMap = new Map<string, OrgItem>()
  const divMap  = new Map<string, OrgItem & { deptCode: string }>()
  const secMap  = new Map<string, OrgItem & { divCode: string }>()

  for (const row of dataRows) {
    const r = row as unknown[]
    const dc = cell(r, col, 'department_code', 5, legacyFixed)
    const dn = cell(r, col, 'department_name', 6, legacyFixed)
    const vc = cell(r, col, 'division_code', 7, legacyFixed)
    const vn = cell(r, col, 'division_name', 8, legacyFixed)
    const sc = cell(r, col, 'section_code', 9, legacyFixed)
    const sn = cell(r, col, 'section_name', 10, legacyFixed)

    const deptKey = deptCodeForRow(dc, dn)
    if (deptKey && dn && !deptMap.has(deptKey)) deptMap.set(deptKey, { code: deptKey, name: dn })
    if (vc && deptKey && !divMap.has(vc)) {
      const raw = String(vn ?? '').trim()
      const name = (canonicalDivisionName(raw) ?? raw) || vc
      divMap.set(vc, { code: vc, name, deptCode: deptKey })
    }
    if (sc && vc && !secMap.has(sc)) secMap.set(sc, { code: sc, name: sn, divCode: vc })
  }

  console.log(`\n📂 ${filePath}`)
  console.log('🏢 Upsert departments...')
  const deptIdMap = new Map<string, string>()
  for (const d of deptMap.values()) {
    const row = await prisma.department.upsert({
      where: { departmentCode: d.code },
      update: { departmentName: d.name || d.code },
      create: { departmentCode: d.code, departmentName: d.name || d.code },
    })
    deptIdMap.set(d.code, row.id)
  }
  console.log(`   ✅ ${deptIdMap.size} departments`)

  console.log('🏗️  Upsert divisions...')
  const divIdMap = new Map<string, string>()
  for (const v of divMap.values()) {
    const deptId = deptIdMap.get(v.deptCode)
    if (!deptId) {
      console.warn(`   ⚠️ ข้ามฝ่าย ${v.code}: ไม่พบแผนก ${v.deptCode}`)
      continue
    }
    const row = await prisma.division.upsert({
      where: { divisionCode: v.code },
      update: { divisionName: v.name || v.code, departmentId: deptId },
      create: {
        divisionCode: v.code,
        divisionName: v.name || v.code,
        departmentId: deptId,
      },
    })
    divIdMap.set(v.code, row.id)
  }
  console.log(`   ✅ ${divIdMap.size} divisions`)

  console.log('📍 Upsert sections...')
  const secIdMap = new Map<string, string>()
  for (const s of secMap.values()) {
    const divId = divIdMap.get(s.divCode)
    if (!divId) {
      console.warn(`   ⚠️ ข้ามส่วน ${s.code}: ไม่พบฝ่าย ${s.divCode}`)
      continue
    }
    const row = await prisma.section.upsert({
      where: { sectionCode: s.code },
      update: { sectionName: s.name || s.code, divisionId: divId },
      create: {
        sectionCode: s.code,
        sectionName: s.name || s.code,
        divisionId: divId,
      },
    })
    secIdMap.set(s.code, row.id)
  }
  console.log(`   ✅ ${secIdMap.size} sections`)

  const defaultPwHash = await bcrypt.hash('changeme123', 10)
  const adminSeedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || ''
  if (!adminSeedPassword) throw new Error('Missing SEED_ADMIN_PASSWORD')
  const adminPwHash   = await bcrypt.hash(adminSeedPassword, 10)

  console.log('👥 Upsert users...')
  let created = 0
  let updated = 0

  for (const row of dataRows) {
    const r = row as unknown[]
    const code = cell(r, col, 'employee_code', 1, legacyFixed)
    if (!code) continue
    if (code === 'ADMIN001') continue

    const dc = cell(r, col, 'department_code', 5, legacyFixed)
    const dn = cell(r, col, 'department_name', 6, legacyFixed)
    const vc = cell(r, col, 'division_code', 7, legacyFixed)
    const sc = cell(r, col, 'section_code', 9, legacyFixed)
    const posCode = cell(r, col, 'position_code', 11, legacyFixed)

    const deptKey = deptCodeForRow(dc, dn)

    const digits = code.replace(/\D/g, '')
    const pin    = digits.slice(-4).padStart(4, '0')

    const existing = await prisma.user.findUnique({ where: { employeeCode: code } })

    await prisma.user.upsert({
      where: { employeeCode: code },
      create: {
        employeeCode:  code,
        employeeTitle: cell(r, col, 'employee_title', 2, legacyFixed) || null,
        firstName:     cell(r, col, 'first_name', 3, legacyFixed) || 'Unknown',
        lastName:      cell(r, col, 'last_name', 4, legacyFixed) || '',
        passwordHash:  defaultPwHash,
        pin,
        role:          mapRole(posCode),
        positionCode:  posCode || null,
        positionName:  cell(r, col, 'position_name', 12, legacyFixed) || null,
        departmentId:  deptKey ? (deptIdMap.get(deptKey) ?? null) : null,
        divisionId:    vc ? (divIdMap.get(vc) ?? null) : null,
        sectionId:     sc ? (secIdMap.get(sc) ?? null) : null,
      },
      update: {
        employeeTitle: cell(r, col, 'employee_title', 2, legacyFixed) || null,
        firstName:     cell(r, col, 'first_name', 3, legacyFixed) || 'Unknown',
        lastName:      cell(r, col, 'last_name', 4, legacyFixed) || '',
        pin,
        role:          mapRole(posCode),
        positionCode:  posCode || null,
        positionName:  cell(r, col, 'position_name', 12, legacyFixed) || null,
        departmentId:  deptKey ? (deptIdMap.get(deptKey) ?? null) : null,
        divisionId:    vc ? (divIdMap.get(vc) ?? null) : null,
        sectionId:     sc ? (secIdMap.get(sc) ?? null) : null,
      },
    })

    if (existing) updated++
    else created++
  }

  await prisma.user.upsert({
    where: { employeeCode: 'ADMIN001' },
    update: {},
    create: {
      employeeCode:  'ADMIN001',
      firstName:     'Admin',
      lastName:      'System',
      passwordHash:  adminPwHash,
      pin:           '0000',
      role:          'ADMIN',
      positionCode:  '12',
      positionName:  'JG12 กรรมการผู้จัดการ / CEO',
    },
  })

  console.log(`   ✅ ผู้ใช้จากไฟล์: สร้างใหม่ ${created}, อัปเดต ${updated}`)
  console.log('   ✅ ADMIN001 (สร้างถ้ายังไม่มี)')
  console.log('\n═══════════════════════════════════════════')
  console.log('  พนักงานใหม่: รหัสผ่าน changeme123')
  console.log('  Admin:       รหัสผ่านตั้งค่าจาก environment')
  console.log('═══════════════════════════════════════════\n')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
