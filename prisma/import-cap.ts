/**
 * Import master data from CAP_Summary.xlsx into the database.
 *
 * What this script imports:
 *  - Sheet "พนักงาน"  → departments, divisions, sections, users
 *  - Sheet "CAP_Summary" → customers, lines (one per Line column), machines,
 *                          parts, machine_part_targets, line_part_targets
 *  - คอลัมน์ Section ใน CAP → จับคู่กับ Section ที่มีในระบบเท่านั้น (ไม่สร้างแผนก CAP-IMP / SEC-* อัตโนมัติ)
 *
 * Excel layout (current workbook format):
 *  Row 0 = headers, data from row 1
 *  Col 0 Line (= lineCode), 2 Section (org grouping), 3 Process, 4 M/C, 5 SAMCO,
 *  6 Part text, 7 Customer, 8 CT, 9 PPH, 10 8Hr, 11 11Hr, 12 Efficiency
 *
 * Line design (Line-centric):
 *  - 1 Row in CAP = 1 Line (Line col) + 1 Part
 *  - Line key = cleaned raw Line value (Col 0)
 *    e.g. "LC65,66" → Line "LC65,66"
 *         "MC-18"   → Line "MC-18"
 *  - Line สัมพันธ์กับ Section ผ่าน Col 2 (PD2-1 ฯลฯ → org section)
 *  - LinePartTarget สร้างจากแต่ละ row โดยตรง (1 row = 1 Line + 1 Part)
 *
 * Decisions applied:
 *  - "เสีย" machines    → imported with isActive = false
 *  - "MC -27" style     → normalized to "MC-27"
 *  - Combined "LC65,66" → split into LC65 + LC66 (both machines share Line "LC65,66")
 *  - Rows with empty / N/A Line/M/C → skipped
 *  - Same base M/C on multiple lines → disambiguated mcNo (mc@LineSlug)
 *  - Customers → code only
 *
 * Run:  npm run db:import
 * File: docs/CAP_Summary.xlsx (repo root)
 *
 * โหมด CAP อย่างเดียว (ไม่มีแผ่น "พนักงาน"):
 *  - สร้างแผนก/ฝ่าย/Section อัตโนมัติจาก CAP_ORG_BOOTSTRAP สำหรับ label ที่รู้จัก (เช่น PD2-1…4)
 *  - label อื่น → สร้าง Section แบบ SEC-* ใต้ฝ่ายเริ่มต้น (ตาม sync เดิม)
 */

import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as bcrypt from 'bcryptjs'
import * as path from 'path'
import * as fs from 'fs'

const prisma = new PrismaClient()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map JG position code → UserRole */
function mapRole(posCode: string): UserRole {
  const g = parseInt(posCode || '0', 10)
  if (g >= 10) return 'ADMIN'
  if (g >= 8)  return 'MANAGER'
  if (g === 7) return 'ENGINEER'
  if (g >= 4)  return 'SUPERVISOR'
  return 'OPERATOR'
}

/** Remove spaces around hyphens, trim whitespace */
function normalizeName(raw: string): string {
  return raw.trim().replace(/\s*-\s*/g, '-').replace(/\s{2,}/g, ' ').trim()
}

/** Check if raw machine name indicates broken/inactive */
function isBroken(raw: string): boolean {
  return raw.includes('เสีย')
}

/** Strip "เสีย" suffix and normalize */
function cleanMcName(raw: string): string {
  return normalizeName(raw.replace(/[-\s]*เสีย/g, ''))
}

/**
 * Split combined machine names into individual machine names.
 *
 * Examples:
 *  "LC65,66"          → ["LC65", "LC66"]
 *  "LC09-10"          → ["LC09", "LC10"]   (range: no hyphen in prefix)
 *  "LC69,70,LC30,31"  → ["LC69", "LC70", "LC30", "LC31"]
 *  "MC-22, 09"        → ["MC-22", "MC-09"] (digits inherit previous prefix)
 *  "P8-FW01,03"       → ["P8-FW01", "P8-FW03"]
 *  "MC-19-เสีย"       → ["MC-19"]          (cleaned before split)
 *  "MC-27"            → ["MC-27"]          (single)
 */
function splitMcNames(raw: string): string[] {
  const cleaned = cleanMcName(raw)
  const parts   = cleaned.split(',').map(s => s.trim()).filter(Boolean)

  const result: string[] = []
  let lastPrefix = ''
  let lastLen    = 2

  for (const p of parts) {
    // Range pattern: 2+ plain letters + 2+ digits + "-" + 2+ digits
    // "LC09-10" matches; "MC-18" does NOT (hyphen is in the prefix)
    const rangeMatch = p.match(/^([A-Za-z]{2,})(\d{2,})-(\d{2,})$/)
    if (rangeMatch) {
      const [, pfx, a, b] = rangeMatch
      const padLen = a.length
      const [lo, hi] = [parseInt(a, 10), parseInt(b, 10)].sort((x, y) => x - y)
      for (let n = lo; n <= hi; n++) {
        result.push(pfx + String(n).padStart(padLen, '0'))
      }
      lastPrefix = pfx
      lastLen    = padLen
      continue
    }

    // Digits only → inherit last prefix
    if (/^\d+$/.test(p)) {
      result.push(lastPrefix + p.padStart(lastLen, '0'))
      continue
    }

    // Normal name: track prefix (everything before trailing digits)
    const prefixMatch = p.match(/^(.*?)(\d+)$/)
    if (prefixMatch) {
      lastPrefix = prefixMatch[1]
      lastLen    = prefixMatch[2].length
    }
    result.push(p)
  }

  return result.length ? result : [cleaned]
}

/** Parse "PartName  PartNo" or "PartName PartNo" */
function parsePartNameNo(raw: string): { partName: string; partNo: string } {
  const s = raw.trim().replace(/\s{3,}/g, '  ')
  // Double-space separator is the strongest signal
  const dblIdx = s.indexOf('  ')
  if (dblIdx > 0) {
    return { partName: s.slice(0, dblIdx).trim(), partNo: s.slice(dblIdx + 2).trim() }
  }
  // Last word looks like a part number (digits / hyphens / letters / parentheses)
  const lastSpace = s.lastIndexOf(' ')
  if (lastSpace > 0) {
    const candidate = s.slice(lastSpace + 1).trim()
    if (/^[\d\-A-Z\/\.()+]+$/i.test(candidate) && /\d/.test(candidate)) {
      return { partName: s.slice(0, lastSpace).trim(), partNo: candidate }
    }
  }
  return { partName: s, partNo: '' }
}

/** CAP_Summary column indices (0-based, current workbook format) */
const CAP = {
  line: 0,
  section: 2,
  process: 3,
  mc: 4,
  samco: 5,
  partRaw: 6,
  customer: 7,
  ct: 8,
  pph: 9,
  t8: 10,
  t11: 11,
  eff: 12,
} as const

/**
 * แมปชื่อ Section ใน CAP (เช่น PD2-1) → sectionCode ในแผ่น "พนักงาน"
 * ใช้คู่กับการจับคู่อัตโนมัติจาก sectionName ใน DB
 */
const capSectionToOrgSection: Record<string, string> = {
  'PD2-1': '22-401',
  'PD2-2': '22-402',
  'PD2-3': '22-501',
  'PD2-4': '22-502',
}

/**
 * เมื่อไม่มีแผ่นพนักงาน — สร้าง org ให้ตรงกับรหัส Section มาตรฐาน (เทียบ seed / โรงงานจริง)
 * key = ค่าในคอลัมน์ Section ของ CAP
 */
const CAP_ORG_BOOTSTRAP: Record<
  string,
  {
    departmentCode: string
    departmentName: string
    divisionCode: string
    divisionName: string
    sectionCode: string
  }
> = {
  'PD2-1': {
    departmentCode: '22-000',
    departmentName: 'ผลิต',
    divisionCode: '22-200',
    divisionName: 'Machine 1',
    sectionCode: '22-401',
  },
  'PD2-2': {
    departmentCode: '22-000',
    departmentName: 'ผลิต',
    divisionCode: '22-200',
    divisionName: 'Machine 1',
    sectionCode: '22-402',
  },
  'PD2-3': {
    departmentCode: '22-000',
    departmentName: 'ผลิต',
    divisionCode: '22-501',
    divisionName: 'Machine 2',
    sectionCode: '22-501',
  },
  'PD2-4': {
    departmentCode: '22-000',
    departmentName: 'ผลิต',
    divisionCode: '22-501',
    divisionName: 'Machine 2',
    sectionCode: '22-502',
  },
}

/**
 * ถ้าไม่มีแผ่นพนักงาน — สร้าง Department / Division / Section จาก CAP_ORG_BOOTSTRAP
 * ตาม label Section ที่ปรากฏในไฟล์ (ให้รหัส org ตรงกับโรงงาน ไม่ใช้แค่ CAP-IMP)
 */
async function bootstrapOrgWhenCapOnly(
  capRows: any[][],
  deptIdMap: Map<string, string>,
  divIdMap: Map<string, string>,
  secIdMap: Map<string, string>,
): Promise<void> {
  if (deptIdMap.size > 0) return

  const labels = new Set<string>()
  for (const r of capRows) {
    const s = String(r[CAP.section] ?? '').trim()
    if (s) labels.add(s)
  }
  if (!labels.size) return

  const deptsDone = new Set<string>()
  const divsDone = new Set<string>()
  const sectionsDone = new Set<string>()
  let bootRows = 0

  for (const label of [...labels].sort()) {
    const meta = CAP_ORG_BOOTSTRAP[label]
    if (!meta) continue

    if (!deptsDone.has(meta.departmentCode)) {
      deptsDone.add(meta.departmentCode)
      const d = await prisma.department.create({
        data: { departmentCode: meta.departmentCode, departmentName: meta.departmentName },
      })
      deptIdMap.set(meta.departmentCode, d.id)
    }

    if (!divsDone.has(meta.divisionCode)) {
      divsDone.add(meta.divisionCode)
      const deptId = deptIdMap.get(meta.departmentCode)!
      const v = await prisma.division.create({
        data: {
          divisionCode: meta.divisionCode,
          divisionName: meta.divisionName,
          departmentId: deptId,
        },
      })
      divIdMap.set(meta.divisionCode, v.id)
    }

    if (sectionsDone.has(meta.sectionCode)) continue
    sectionsDone.add(meta.sectionCode)

    const divId = divIdMap.get(meta.divisionCode)!
    const sec = await prisma.section.create({
      data: {
        sectionCode: meta.sectionCode,
        sectionName: label,
        divisionId: divId,
      },
    })
    secIdMap.set(meta.sectionCode, sec.id)
    secIdMap.set(label, sec.id)
    bootRows++
  }

  if (bootRows) {
    console.log(
      `   ℹ️  โหมด CAP เท่านั้น: สร้างแผนก/ฝ่าย/Section มาตรฐาน ${bootRows} Section จาก CAP_ORG_BOOTSTRAP`,
    )
  }
}

/**
 * จับคู่ค่า Section ใน CAP_Summary col 2 กับ Section ที่มีใน DB / พนักงาน / bootstrap
 * ไม่สร้าง Section แบบ SEC-* หรือแผนก CAP-IMP อัตโนมัติ — ถ้าไม่พบจะข้าม (สายอาจไม่มี sectionId)
 */
async function syncCapSectionsFromCapColumn(
  capRows: any[][],
  secIdMap: Map<string, string>,
  _deptIdMap: Map<string, string>,
  _divIdMap: Map<string, string>,
): Promise<void> {
  const unique = new Set<string>()
  for (const r of capRows) {
    const raw = String(r[CAP.section] ?? '').trim()
    if (raw) unique.add(raw)
  }
  if (!unique.size) return

  const existing = await prisma.section.findMany()

  const norm = (x: string) => normalizeName(x).toLowerCase()

  const findMatchingSectionId = (label: string): string | null => {
    const orgCode = capSectionToOrgSection[label]
    if (orgCode && secIdMap.has(orgCode)) return secIdMap.get(orgCode)!
    if (secIdMap.has(label)) return secIdMap.get(label)!
    const nl = norm(label)
    for (const sec of existing) {
      if (sec.sectionCode === label) return sec.id
      if (sec.sectionName === label) return sec.id
      if (norm(sec.sectionName) === nl) return sec.id
      if (label.length >= 3 && sec.sectionName.includes(label)) return sec.id
    }
    return null
  }

  const unmatched: string[] = []
  for (const label of [...unique].sort()) {
    const id = findMatchingSectionId(label)
    if (id) {
      secIdMap.set(label, id)
      const sec = existing.find(s => s.id === id)
      if (sec) secIdMap.set(sec.sectionCode, id)
    } else {
      unmatched.push(label)
    }
  }

  if (unmatched.length) {
    console.warn(
      `   ⚠️  ไม่พบ Section ในระบบสำหรับ label ใน CAP: ${unmatched.join(', ')} — ใส่ในแผ่นพนักงาน/import-employees หรือ master/departments`,
    )
  } else {
    console.log(`   ✅ Section จากคอลัมน์ CAP: จับคู่ครบ ${unique.size} ค่า`)
  }
}

function resolveLineSectionId(capSection: string, secIdMap: Map<string, string>): string | null {
  const s = capSection.trim()
  if (!s) return null
  const org = capSectionToOrgSection[s]
  if (org && secIdMap.has(org)) return secIdMap.get(org)!
  if (secIdMap.has(s)) return secIdMap.get(s)!
  const n = normalizeName(s)
  if (secIdMap.has(n)) return secIdMap.get(n)!
  return null
}

function isSkippableMcRaw(raw: string): boolean {
  const s = raw.trim()
  if (!s) return true
  if (s.toUpperCase() === 'N/A' || s === '-') return true
  return false
}

function slugLineForMc(lineCode: string): string {
  return lineCode.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'LINE'
}

/**
 * ถ้า base machine name เดิมปรากฏในหลาย Line → ทำให้ mcNo unique ด้วย @line suffix
 */
function buildMcNoResolver(capRows: any[][]): (baseName: string, lineCode: string) => string {
  const baseToLines = new Map<string, Set<string>>()
  for (const r of capRows) {
    const rawLine = String(r[CAP.line] || '').trim()
    const rawMc   = String(r[CAP.mc] || '').trim()
    if (isSkippableMcRaw(rawLine) || isSkippableMcRaw(rawMc)) continue
    const lineCode = cleanMcName(rawLine)
    const names    = splitMcNames(rawMc)
    for (const name of names) {
      if (!baseToLines.has(name)) baseToLines.set(name, new Set())
      baseToLines.get(name)!.add(lineCode)
    }
  }
  return (baseName: string, lineCode: string) => {
    const lines = baseToLines.get(baseName)
    if (!lines || lines.size <= 1) return baseName
    return `${baseName}@${slugLineForMc(lineCode)}`
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const xlsxPath = path.join(__dirname, '../docs/CAP_Summary.xlsx')
  let wb         = XLSX.readFile(xlsxPath)

  // Optional: employee/org sheet is often in a separate workbook — merge if needed
  if (!wb.Sheets['พนักงาน']) {
    const empPath = path.join(__dirname, '../docs/พนักงาน.xlsx')
    if (fs.existsSync(empPath)) {
      const ew = XLSX.readFile(empPath)
      const ws = ew.Sheets['พนักงาน']
      if (ws) {
        wb.Sheets['พนักงาน'] = ws
        if (!wb.SheetNames.includes('พนักงาน')) wb.SheetNames.push('พนักงาน')
        console.log('   ℹ️  Merged sheet "พนักงาน" from docs/พนักงาน.xlsx')
      }
    } else {
      console.log(
        '\n   ℹ️  ไม่มีแผ่น "พนักงาน" — ใช้เฉพาะ CAP_Summary: สร้าง org จาก CAP_ORG_BOOTSTRAP + คอลัมน์ Section\n' +
          '      (ผู้ใช้พนักงานจะไม่ถูกนำเข้า — เหลือแอดมิน ADMIN001 เท่านั้น; ใส่แผ่นพนักงานในไฟล์เดียวกันหรือ docs/พนักงาน.xlsx ถ้าต้องการ)\n',
      )
    }
  }

  // ── 0. Clear existing master data (reverse FK order) ──────────────────────
  console.log('\n🗑️  Clearing existing data...')
  await prisma.notification.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.scanLog.deleteMany()
  await prisma.ngLog.deleteMany()
  await prisma.breakdownLog.deleteMany()
  await prisma.modelChange.deleteMany()
  await prisma.hourlyRecord.deleteMany()
  await prisma.productionSession.deleteMany()
  await prisma.machineQrCode.deleteMany()
  await prisma.machineImage.deleteMany()
  await prisma.machinePartTarget.deleteMany()
  await prisma.userPartCapability.deleteMany()
  await prisma.machine.deleteMany()
  await prisma.line.deleteMany()
  await prisma.part.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()          // before departments (FK)
  await prisma.section.deleteMany()
  await prisma.division.deleteMany()
  await prisma.department.deleteMany()
  console.log('   Done.')

  // ── 1. Parse พนักงาน sheet ────────────────────────────────────────────────
  const empWs = wb.Sheets['พนักงาน']
  const empRaw = empWs
    ? (XLSX.utils.sheet_to_json<string[]>(empWs, { header: 1, defval: '' }) as string[][])
    : []
  const empRows = empRaw.slice(3)         // skip title + 2 header rows

  type OrgItem = { code: string; name: string }
  const deptMap = new Map<string, OrgItem>()                              // code → info
  const divMap  = new Map<string, OrgItem & { deptCode: string }>()
  const secMap  = new Map<string, OrgItem & { divCode: string }>()

  for (const r of empRows) {
    const dc = String(r[5]  || '').trim()
    const dn = String(r[6]  || '').trim()
    const vc = String(r[7]  || '').trim()
    const vn = String(r[8]  || '').trim()
    const sc = String(r[9]  || '').trim()
    const sn = String(r[10] || '').trim()

    if (dc && !deptMap.has(dc)) deptMap.set(dc, { code: dc, name: dn })
    if (vc && dc && !divMap.has(vc)) divMap.set(vc, { code: vc, name: vn, deptCode: dc })
    if (sc && vc && !secMap.has(sc)) secMap.set(sc, { code: sc, name: sn, divCode: vc })
  }

  // ── 2. Create Departments ─────────────────────────────────────────────────
  console.log('\n🏢 Importing departments...')
  const deptIdMap = new Map<string, string>()
  for (const d of deptMap.values()) {
    const row = await prisma.department.create({
      data: { departmentCode: d.code, departmentName: d.name },
    })
    deptIdMap.set(d.code, row.id)
  }
  console.log(`   ✅ ${deptIdMap.size} departments`)

  // ── 3. Create Divisions ───────────────────────────────────────────────────
  console.log('🏗️  Importing divisions...')
  const divIdMap = new Map<string, string>()
  for (const v of divMap.values()) {
    const deptId = deptIdMap.get(v.deptCode)
    if (!deptId) { console.warn(`   ⚠️ Division ${v.code}: dept ${v.deptCode} not found`); continue }
    const row = await prisma.division.create({
      data: { divisionCode: v.code, divisionName: v.name, departmentId: deptId },
    })
    divIdMap.set(v.code, row.id)
  }
  console.log(`   ✅ ${divIdMap.size} divisions`)

  // ── 4. Create Sections ────────────────────────────────────────────────────
  console.log('📍 Importing sections...')
  const secIdMap = new Map<string, string>()
  for (const s of secMap.values()) {
    const divId = divIdMap.get(s.divCode)
    if (!divId) { console.warn(`   ⚠️ Section ${s.code}: div ${s.divCode} not found`); continue }
    const row = await prisma.section.create({
      data: { sectionCode: s.code, sectionName: s.name, divisionId: divId },
    })
    secIdMap.set(s.code, row.id)
  }
  console.log(`   ✅ ${secIdMap.size} sections`)

  // ── 5. Create Users ───────────────────────────────────────────────────────
  console.log('👥 Importing users...')
  const defaultPwHash = await bcrypt.hash('changeme123', 10)
  const adminSeedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || ''
  if (!adminSeedPassword) throw new Error('Missing SEED_ADMIN_PASSWORD')
  const adminPwHash   = await bcrypt.hash(adminSeedPassword, 10)

  // Admin account
  await prisma.user.create({
    data: {
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

  let userCount = 1
  for (const r of empRows) {
    const code = String(r[1] || '').trim()
    if (!code) continue

    const deptCode = String(r[5]  || '').trim()
    const divCode  = String(r[7]  || '').trim()
    const secCode  = String(r[9]  || '').trim()
    const posCode  = String(r[11] || '').trim()

    // PIN = last 4 digits of employee code
    const digits = code.replace(/\D/g, '')
    const pin    = digits.slice(-4).padStart(4, '0')

    await prisma.user.create({
      data: {
        employeeCode:  code,
        employeeTitle: String(r[2] || '').trim() || null,
        firstName:     String(r[3] || '').trim() || 'Unknown',
        lastName:      String(r[4] || '').trim() || '',
        passwordHash:  defaultPwHash,
        pin,
        role:          mapRole(posCode),
        positionCode:  posCode || null,
        positionName:  String(r[12] || '').trim() || null,
        departmentId:  deptCode ? (deptIdMap.get(deptCode) ?? null) : null,
        divisionId:    divCode  ? (divIdMap.get(divCode)   ?? null) : null,
        sectionId:     secCode  ? (secIdMap.get(secCode)   ?? null) : null,
      },
    })
    userCount++
  }
  console.log(`   ✅ ${userCount} users (ADMIN001 + ${userCount - 1} employees/changeme123)`)

  // ── 6. Parse CAP_Summary sheet ────────────────────────────────────────────
  const capWs   = wb.Sheets['CAP_Summary']
  if (!capWs) {
    throw new Error('Sheet "CAP_Summary" not found in workbook')
  }
  const capRaw  = XLSX.utils.sheet_to_json<any[]>(capWs, { header: 1, defval: '' }) as any[][]
  const capRows = capRaw.slice(1)          // row 0 = header, data starts row 1

  const resolveMcNo = buildMcNoResolver(capRows)

  // ── 6b. CAP เท่านั้น: สร้างแผนก/ฝ่าย/Section มาตรฐานจาก label ในไฟล์
  await bootstrapOrgWhenCapOnly(capRows, deptIdMap, divIdMap, secIdMap)

  // ── 6c. Section จากคอลัมน์ CAP → จับคู่กับ org / สร้างใหม่ให้ครบ (label ที่ไม่มีใน bootstrap)
  console.log('\n📍 Syncing sections from CAP_Summary (column Section)...')
  await syncCapSectionsFromCapColumn(capRows, secIdMap, deptIdMap, divIdMap)

  // ── 7. Create Customers ───────────────────────────────────────────────────
  console.log('\n🏭 Importing customers...')
  const custCodes = new Set<string>()
  for (const r of capRows) {
    const c = String(r[CAP.customer] || '').trim()
    if (c && c !== '0' && isNaN(Number(c))) custCodes.add(c)
  }
  const custIdMap = new Map<string, string>()
  for (const code of custCodes) {
    const row = await prisma.customer.create({ data: { customerCode: code } })
    custIdMap.set(code, row.id)
  }
  console.log(`   ✅ ${custIdMap.size} customers: ${[...custCodes].join(', ')}`)

  // ── 8. Create Lines — 1 Line per Line column ────────────────────────────────
  console.log('\n🔄 Importing lines...')
  // Collect unique lines → their CAP section and process
  type LineInfo = { capSection: string; process: string }
  const lineCodeMap = new Map<string, LineInfo>()
  const lineSectionMismatches: string[] = []

  for (const r of capRows) {
    const rawLine    = String(r[CAP.line] || '').trim()
    const capSection = String(r[CAP.section] || '').trim()
    const process    = String(r[CAP.process] || '').trim()
    if (isSkippableMcRaw(rawLine) || !capSection) continue
    const lineCode = cleanMcName(rawLine)
    const prev = lineCodeMap.get(lineCode)
    if (!prev) {
      lineCodeMap.set(lineCode, { capSection, process })
    } else if (prev.capSection !== capSection) {
      lineSectionMismatches.push(
        `   ⚠️  สาย "${lineCode}" มี Section ไม่ตรงกัน: ใช้ "${prev.capSection}" (แถวแรก) ไม่ใช้ "${capSection}"`,
      )
    }
  }
  if (lineSectionMismatches.length) {
    console.log('   (แจ้งเตือน Section ต่อสาย)')
    lineSectionMismatches.forEach(m => console.log(m))
  }

  const sectionIdToDivisionCode = new Map<string, string>()
  for (const s of await prisma.section.findMany({
    select: { id: true, division: { select: { divisionCode: true } } },
  })) {
    sectionIdToDivisionCode.set(s.id, s.division.divisionCode)
  }

  const lineIdMap = new Map<string, string>()  // cleaned lineCode → lineId
  for (const [lineCode, info] of [...lineCodeMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'th', { numeric: true })
  )) {
    const secId = resolveLineSectionId(info.capSection, secIdMap)

    const row = await prisma.line.create({
      data: {
        lineCode,
        lineName: `สาย ${lineCode}`,
        sectionId: secId,
        divisionCode: secId
          ? (sectionIdToDivisionCode.get(secId) ?? null)
          : null,
        description: `ไลน์ ${lineCode} (${info.capSection})`,
      } as Prisma.LineUncheckedCreateInput,
    })
    lineIdMap.set(lineCode, row.id)
  }
  console.log(`   ✅ ${lineIdMap.size} lines`)

  // ── 9. Create Parts ───────────────────────────────────────────────────────
  console.log('\n🔩 Importing parts...')
  const partIdMap  = new Map<number, string>()   // samco → id
  const partSeen   = new Set<number>()

  for (const r of capRows) {
    const samco = Number(r[CAP.samco])
    if (!samco || partSeen.has(samco)) continue
    partSeen.add(samco)

    const raw      = String(r[CAP.partRaw] || '').trim()
    const custCode = String(r[CAP.customer] || '').trim()
    const { partName, partNo } = parsePartNameNo(raw)

    const row = await prisma.part.create({
      data: {
        partSamco:  samco,
        partName:   partName || raw,
        partNo:     partNo   || String(samco),
        customerId: (custCode && custCode !== '0' && isNaN(Number(custCode)))
                      ? (custIdMap.get(custCode) ?? null)
                      : null,
      },
    })
    partIdMap.set(samco, row.id)
  }
  console.log(`   ✅ ${partIdMap.size} parts`)

  // ── 10. Create Machines ───────────────────────────────────────────────────
  // แต่ละ Line อาจมีหลายเครื่อง เช่น Line "LC65,66" มีเครื่อง LC65 + LC66
  console.log('\n🔧 Importing machines...')
  const machineIdMap = new Map<string, string>()  // resolved mcNo → id
  let   brokenCount  = 0

  for (const r of capRows) {
    const rawLine = String(r[CAP.line] || '').trim()
    const rawMc   = String(r[CAP.mc] || '').trim()
    const process = String(r[CAP.process] || '').trim()

    if (isSkippableMcRaw(rawLine) || isSkippableMcRaw(rawMc)) continue
    const lineCode = cleanMcName(rawLine)
    if (!lineIdMap.has(lineCode)) continue

    const inactive = isBroken(rawMc)
    const names    = splitMcNames(rawMc)

    for (const name of names) {
      const mcNo = resolveMcNo(name, lineCode)
      if (machineIdMap.has(mcNo)) continue

      const row = await prisma.machine.create({
        data: {
          mcNo:       mcNo,
          mcName:     name,
          lineId:     lineIdMap.get(lineCode)!,
          department: 'PD2',
          process:    process || null,
          isActive:   !inactive,
          remark:     inactive ? 'นำเข้าจาก CAP Survey (สถานะเสีย)' : null,
        },
      })
      machineIdMap.set(mcNo, row.id)
      if (inactive) brokenCount++
    }
  }
  console.log(`   ✅ ${machineIdMap.size} machines (${brokenCount} inactive/เสีย)`)

  // ── 11. Create MachinePartTargets ─────────────────────────────────────────
  console.log('\n🎯 Importing machine_part_targets...')
  const targetSeen  = new Set<string>()   // "machineId:partId"
  const dupWarnings: string[] = []
  let   targetCount = 0
  const effectDate  = new Date('2025-01-01')

  for (const r of capRows) {
    const rawLine = String(r[CAP.line] || '').trim()
    const rawMc  = String(r[CAP.mc] || '').trim()
    const samco  = Number(r[CAP.samco])
    const ct     = r[CAP.ct]
    const pph    = r[CAP.pph]
    const t8     = r[CAP.t8]
    const t11    = r[CAP.t11]
    const effNum = Number(r[CAP.eff])
    let eff = 0.85
    if (Number.isFinite(effNum) && effNum > 0) {
      if (effNum <= 1) eff = effNum
      else if (effNum <= 100) eff = effNum / 100
    }

    if (isSkippableMcRaw(rawLine) || isSkippableMcRaw(rawMc)) continue
    const lineCode = cleanMcName(rawLine)
    if (!lineIdMap.has(lineCode)) continue
    if (!samco) continue
    const pphNum = typeof pph === 'number' ? pph : parseFloat(String(pph))
    const ctNum  = typeof ct  === 'number' ? ct  : parseFloat(String(ct))
    if (!Number.isFinite(pphNum) || pphNum <= 0) continue
    if (!Number.isFinite(ctNum)  || ctNum  <= 0) continue

    const partId = partIdMap.get(samco)
    if (!partId) continue

    const names = splitMcNames(rawMc)

    for (const name of names) {
      const mcNo      = resolveMcNo(name, lineCode)
      const machineId = machineIdMap.get(mcNo)
      if (!machineId) continue

      const key = `${machineId}:${partId}`
      if (targetSeen.has(key)) {
        dupWarnings.push(`   ⚠️  Duplicate skipped: ${mcNo} × SAMCO ${samco}`)
        continue
      }
      targetSeen.add(key)

      const t8n  = typeof t8  === 'number' ? t8  : parseFloat(String(t8))
      const t11n = typeof t11 === 'number' ? t11 : parseFloat(String(t11))

      await prisma.machinePartTarget.create({
        data: {
          machineId,
          partId,
          cycleTimeMin:  ctNum,
          piecesPerHour: Math.round(pphNum),
          target8Hr:     Number.isFinite(t8n)  ? Math.round(t8n)  : 0,
          target11Hr:    Number.isFinite(t11n) ? Math.round(t11n) : 0,
          efficiency:    eff,
          effectiveDate: effectDate,
        },
      })
      targetCount++
    }
  }

  if (dupWarnings.length) {
    console.log(`   Duplicates skipped (${dupWarnings.length}):`)
    dupWarnings.forEach(w => console.log(w))
  }
  console.log(`   ✅ ${targetCount} machine_part_targets`)

  // ── 12. Create LinePartTargets ────────────────────────────────────────────
  // 1 row ใน CAP = 1 Line (M/C group) + 1 Part → สร้าง LinePartTarget โดยตรง
  // ไม่ต้อง aggregate — PPH ใน CAP คือค่าของ Line นั้นๆ สำหรับ Part นั้นๆ
  console.log('\n📊 Importing line_part_targets...')
  const lineTargetSeen = new Set<string>()  // "lineId:partId"
  const lineTargetDups: string[] = []
  let lineTargetCount = 0

  for (const r of capRows) {
    const rawLine = String(r[CAP.line] || '').trim()
    const rawMc  = String(r[CAP.mc] || '').trim()
    const samco  = Number(r[CAP.samco])
    const ct     = r[CAP.ct]
    const pph    = r[CAP.pph]
    const t8     = r[CAP.t8]
    const t11    = r[CAP.t11]

    if (isSkippableMcRaw(rawLine) || isSkippableMcRaw(rawMc) || isBroken(rawMc)) continue
    const lineCode = cleanMcName(rawLine)
    const lineId  = lineIdMap.get(lineCode)
    if (!lineId) continue
    if (!samco) continue

    const pphNum = typeof pph === 'number' ? pph : parseFloat(String(pph))
    const ctNum  = typeof ct  === 'number' ? ct  : parseFloat(String(ct))
    if (!Number.isFinite(pphNum) || pphNum <= 0) continue

    const partId = partIdMap.get(samco)
    if (!partId) continue

    const key = `${lineId}:${partId}`
    if (lineTargetSeen.has(key)) {
      lineTargetDups.push(`   ⚠️  Duplicate skipped: Line ${lineCode} × SAMCO ${samco}`)
      continue
    }
    lineTargetSeen.add(key)

    const effNum = Number(r[CAP.eff])
    let eff = 0.85
    if (Number.isFinite(effNum) && effNum > 0) {
      if (effNum <= 1) eff = effNum
      else if (effNum <= 100) eff = effNum / 100
    }
    const t8n  = typeof t8  === 'number' ? t8  : parseFloat(String(t8))
    const t11n = typeof t11 === 'number' ? t11 : parseFloat(String(t11))

    await prisma.linePartTarget.create({
      data: {
        lineId,
        partId,
        piecesPerHour: Math.round(pphNum),
        target8Hr:     Number.isFinite(t8n)  ? Math.round(t8n)  : 0,
        target11Hr:    Number.isFinite(t11n) ? Math.round(t11n) : 0,
        cycleTimeMin:  Number.isFinite(ctNum) ? ctNum : null,
        efficiency:    eff,
        effectiveDate: effectDate,
      },
    })
    lineTargetCount++
  }

  if (lineTargetDups.length) {
    lineTargetDups.forEach(w => console.log(w))
  }
  console.log(`   ✅ ${lineTargetCount} line_part_targets`)

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════')
  console.log('🎉  Import completed successfully!')
  console.log('═══════════════════════════════════════════')
  console.log(`  Departments : ${deptIdMap.size}`)
  console.log(`  Divisions   : ${divIdMap.size}`)
  console.log(`  Sections    : ${secIdMap.size}`)
  console.log(`  Users       : ${userCount} (admin + ${userCount - 1} employees)`)
  console.log(`  Customers   : ${custIdMap.size}`)
  console.log(`  Lines       : ${lineIdMap.size}`)
  console.log(`  Machines    : ${machineIdMap.size} (${brokenCount} inactive)`)
  console.log(`  Parts       : ${partIdMap.size}`)
  console.log(`  Targets     : ${targetCount}`)
  console.log(`  LineTargets : ${lineTargetCount}`)
  console.log('───────────────────────────────────────────')
  console.log('  Login: ADMIN001 / รหัสผ่านจาก environment')
  console.log('  Staff: <employeeCode> / changeme123')
  console.log('  PIN:   last 4 digits of employee code')
  console.log('═══════════════════════════════════════════\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
