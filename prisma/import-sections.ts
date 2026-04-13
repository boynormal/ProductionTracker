/**
 * นำเข้า Department / Division / Section จากไฟล์ Excel
 *
 * รูปแบบไฟล์:
 *   - แผ่นแรก หรือแผ่นชื่อ "Sections"
 *   - แถวแรก = หัวคอลัมน์ (ไม่สนตัวพิมพ์เล็กใหญ่)
 *
 * คอลัมน์ที่รองรับ:
 *   departmentCode, departmentName  — แผนก (สร้างถ้ายังไม่มี)
 *   divisionCode, divisionName      — ฝ่าย (สร้างถ้ายังไม่มี ต้องมีแผนก)
 *   sectionCode, sectionName          — Section (บังคับ)
 *
 * Run:
 *   npm run db:import-sections
 *   npm run db:import-sections -- path/to/file.xlsx
 *
 * สร้างไฟล์ตัวอย่าง:
 *   npm run db:import-sections -- --template
 */

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'

const prisma = new PrismaClient()

const DEFAULT_PATH = path.join(__dirname, '../docs/sections.xlsx')
const TEMPLATE_PATH = path.join(__dirname, '../docs/sections-template.xlsx')

const HEADER_ALIASES: Record<string, keyof RowInput> = {
  departmentcode: 'departmentCode',
  departmentname: 'departmentName',
  divisioncode: 'divisionCode',
  divisionname: 'divisionName',
  sectioncode: 'sectionCode',
  sectionname: 'sectionName',
  // Thai aliases
  รหัสแผนก: 'departmentCode',
  ชื่อแผนก: 'departmentName',
  รหัสฝ่าย: 'divisionCode',
  ชื่อฝ่าย: 'divisionName',
  รหัสส่วน: 'sectionCode',
  ชื่อส่วน: 'sectionName',
}

type RowInput = {
  departmentCode: string
  departmentName: string
  divisionCode: string
  divisionName: string
  sectionCode: string
  sectionName: string
}

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, '').toLowerCase()
}

function parseHeaders(row: unknown[]): Partial<Record<keyof RowInput, number>> {
  const map: Partial<Record<keyof RowInput, number>> = {}
  row.forEach((cell, i) => {
    const raw = String(cell ?? '').trim()
    if (!raw) return
    const key = HEADER_ALIASES[normalizeHeader(raw)]
    if (key) map[key] = i
  })
  return map
}

function rowToInput(
  row: unknown[],
  col: Partial<Record<keyof RowInput, number>>,
): Partial<RowInput> {
  const out: Partial<RowInput> = {}
  for (const k of Object.keys(col) as (keyof RowInput)[]) {
    const idx = col[k]
    if (idx === undefined) continue
    out[k] = String(row[idx] ?? '').trim()
  }
  return out
}

function isRowEmpty(r: Partial<RowInput>): boolean {
  return !r.sectionCode && !r.sectionName && !r.divisionCode
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--template')) {
    const dir = path.dirname(TEMPLATE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const sampleRows: (string | number)[][] = [
      [
        'departmentCode',
        'departmentName',
        'divisionCode',
        'divisionName',
        'sectionCode',
        'sectionName',
      ],
      ['22-000', 'ผลิต', '22-200', 'Machine 1', '22-401', 'PD2-1'],
      ['22-000', 'ผลิต', '22-200', 'Machine 1', '22-402', 'PD2-2'],
      ['22-000', 'ผลิต', '22-501', 'Machine 2', '22-501', 'PD2-3'],
      ['22-000', 'ผลิต', '22-502', 'Machine 2', '22-502', 'PD2-4'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(sampleRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sections')
    XLSX.writeFile(wb, TEMPLATE_PATH)
    const defaultImport = path.join(__dirname, '../docs/sections.xlsx')
    fs.copyFileSync(TEMPLATE_PATH, defaultImport)
    console.log(`✅ สร้างไฟล์ตัวอย่างแล้ว: ${TEMPLATE_PATH}`)
    console.log(`   และคัดลอกเป็น ${defaultImport} (แก้ไขแล้วรัน npm run db:import-sections)`)
    return
  }

  const filePath = args.find(a => !a.startsWith('--')) ?? DEFAULT_PATH
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ไม่พบไฟล์: ${filePath}`)
    console.error(`   วางไฟล์ที่ docs/sections.xlsx หรือระบุ path`)
    console.error(`   สร้างตัวอย่าง: npm run db:import-sections -- --template`)
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  const sheetName =
    wb.SheetNames.find(n => n.toLowerCase() === 'sections') ?? wb.SheetNames[0]
  if (!sheetName) {
    console.error('❌ ไม่มีแผ่นงานในไฟล์ Excel')
    process.exit(1)
  }

  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (raw.length < 2) {
    console.error('❌ ต้องมีหัวคอลัมน์และอย่างน้อย 1 แถวข้อมูล')
    process.exit(1)
  }

  const col = parseHeaders(raw[0] as unknown[])
  if (col.sectionCode === undefined || col.sectionName === undefined) {
    console.error(
      '❌ ต้องมีคอลัมน์ sectionCode และ sectionName (หรือ รหัสส่วน / ชื่อส่วน)',
    )
    process.exit(1)
  }
  if (col.divisionCode === undefined) {
    console.error('❌ ต้องมีคอลัมน์ divisionCode (หรือ รหัสฝ่าย)')
    process.exit(1)
  }

  console.log(`\n📂 อ่านไฟล์: ${filePath} (แผ่น "${sheetName}")\n`)

  let rowOk = 0
  const warnings: string[] = []

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const data = rowToInput(row, col)
    if (isRowEmpty(data)) continue

    const sectionCode = data.sectionCode?.trim()
    const sectionName = data.sectionName?.trim()
    const divisionCode = data.divisionCode?.trim()
    if (!sectionCode || !sectionName) {
      warnings.push(`   แถว ${i + 1}: ข้าม — ไม่ครบ sectionCode / sectionName`)
      continue
    }
    if (!divisionCode) {
      warnings.push(`   แถว ${i + 1}: ข้าม — ไม่มี divisionCode`)
      continue
    }

    const deptCode = data.departmentCode?.trim()
    const deptName = data.departmentName?.trim() || deptCode || '—'
    let departmentId: string | undefined

    if (deptCode) {
      const dept = await prisma.department.upsert({
        where: { departmentCode: deptCode },
        update: { departmentName: deptName },
        create: { departmentCode: deptCode, departmentName: deptName },
      })
      departmentId = dept.id
    } else {
      const divExisting = await prisma.division.findUnique({
        where: { divisionCode },
      })
      if (!divExisting) {
        warnings.push(
          `   แถว ${i + 1}: ข้าม — ไม่มี departmentCode และยังไม่มีฝ่าย ${divisionCode} ในระบบ`,
        )
        continue
      }
      departmentId = divExisting.departmentId
    }

    const divName = data.divisionName?.trim() || divisionCode

    let division = await prisma.division.findUnique({ where: { divisionCode } })
    if (!division) {
      if (!departmentId) {
        warnings.push(`   แถว ${i + 1}: ข้าม — ไม่สามารถสร้างฝ่ายได้ (ไม่มีแผนก)`)
        continue
      }
      division = await prisma.division.create({
        data: {
          divisionCode,
          divisionName: divName,
          departmentId,
        },
      })
    } else {
      await prisma.division.update({
        where: { id: division.id },
        data: { divisionName: divName },
      })
    }

    await prisma.section.upsert({
      where: { sectionCode },
      update: { sectionName, divisionId: division.id, isActive: true },
      create: {
        sectionCode,
        sectionName,
        divisionId: division.id,
      },
    })
    rowOk++
  }

  console.log('✅ นำเข้าเสร็จ')
  console.log(`   แถวที่บันทึก Section สำเร็จ: ${rowOk}`)
  if (warnings.length) {
    console.log('\n⚠️  คำเตือน:')
    warnings.forEach(w => console.log(w))
  }
  console.log('')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
