import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedPermissions } from './seed-permissions'

const prisma = new PrismaClient()
const adminSeedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || ''
const operatorSeedPassword = process.env.SEED_OPERATOR_PASSWORD?.trim() || ''

async function main() {
  console.log('🌱 Seeding database...')
  if (!adminSeedPassword || !operatorSeedPassword) {
    throw new Error('Missing SEED_ADMIN_PASSWORD or SEED_OPERATOR_PASSWORD')
  }

  // 1. Organization Structure
  const deptProd = await prisma.department.upsert({
    where: { departmentCode: '22-000' },
    update: {},
    create: { departmentCode: '22-000', departmentName: 'ผลิต' },
  })

  const divMc1 = await prisma.division.upsert({
    where: { divisionCode: '22-200' },
    update: {},
    create: { departmentId: deptProd.id, divisionCode: '22-200', divisionName: 'Machine 1' },
  })

  const secPD21 = await prisma.section.upsert({
    where: { sectionCode: '22-401' },
    update: {},
    create: { divisionId: divMc1.id, sectionCode: '22-401', sectionName: 'PD2-1' },
  })

  // 2. Lines
  const linePD21 = await prisma.line.upsert({
    where: { lineCode: 'PD2-1' },
    update: { divisionCode: divMc1.divisionCode },
    create: {
      sectionId:    secPD21.id,
      divisionCode: divMc1.divisionCode,
      lineCode:     'PD2-1',
      lineName:     'Production Line PD2-1',
    },
  })

  // 3. Customer
  const custRST = await prisma.customer.upsert({
    where: { customerCode: 'RST' },
    update: {},
    create: { customerCode: 'RST', customerName: 'RST Corporation' },
  })

  // 4. Machine
  const mc1 = await prisma.machine.upsert({
    where: { mcNo: 'LC65,66' },
    update: {},
    create: {
      lineId: linePD21.id,
      mcNo: 'LC65,66',
      mcName: 'Lathe CNC LC65,66',
      mcType: 'Lathe',
      department: 'MACHINE 1',
      process: 'OPM01',
      sheetRef: 'LC65,66',
      assetCode: 'AST-2018-065',
      serialNo: 'MZ-LC65-2018-00123',
      brand: 'Mazak',
      modelNo: 'QT-250',
      manufacturerYear: 2018,
      location: 'Building 1 / Zone A / Row 3',
      powerKW: 18.5,
      maintenanceIntervalDays: 90,
      lastMaintenanceDate: new Date('2026-01-10'),
      nextMaintenanceDate: new Date('2026-04-10'),
      responsiblePerson: 'สมชาย มั่นคง',
      pmGeneralNote: 'PM ทั่วไป (ทุก 90 วัน):\n- ตรวจสอบและเติมน้ำมันหล่อลื่น Spindle\n- ทำความสะอาดรางเลื่อน (Guideway)\n- เช็คระดับน้ำมันไฮดรอลิก\n- ตรวจสอบสายพาน (Belt)\n- เช็ค Coolant',
      pmMajorNote: 'PM ใหญ่ (ทุก 1 ปี):\n- ถอดล้างและตรวจสอบ Spindle Bearing\n- Calibrate ความแม่นยำตำแหน่ง X/Z Axis\n- ตรวจสอบ Ball Screw\n- ออกใบรับรองการสอบเทียบ',
      conditionRating: 4,
    },
  })

  // 5. Part
  const part1 = await prisma.part.upsert({
    where: { partSamco: 6150 },
    update: {},
    create: {
      partSamco: 6150,
      partNo: '8983980750',
      partName: 'Coupling Driving',
      customerId: custRST.id,
    },
  })

  // 6. Machine Part Target
  await prisma.machinePartTarget.upsert({
    where: { machineId_partId_effectiveDate: {
      machineId: mc1.id,
      partId: part1.id,
      effectiveDate: new Date('2024-01-01'),
    }},
    update: {},
    create: {
      machineId: mc1.id,
      partId: part1.id,
      cycleTimeMin: 1.2,
      piecesPerHour: 50,
      target8Hr: 332,
      target11Hr: 446,
      efficiency: 0.85,
      effectiveDate: new Date('2024-01-01'),
    },
  })

  // 7. Problem Categories
  const problemData = [
    { code: 'BK-001', name: 'แม่พิมพ์เสีย', type: 'BREAKDOWN' as const },
    { code: 'BK-002', name: 'เครื่องขัดข้อง', type: 'BREAKDOWN' as const },
    { code: 'BK-003', name: 'ไฟฟ้าขัดข้อง', type: 'BREAKDOWN' as const },
    { code: 'BK-004', name: 'รอวัตถุดิบ', type: 'BREAKDOWN' as const },
    { code: 'NG-001', name: 'Burr / Flash', type: 'NG' as const },
    { code: 'NG-002', name: 'ขนาดเกิน Tolerance', type: 'NG' as const },
    { code: 'NG-003', name: 'ผิวขรุขระ', type: 'NG' as const },
    { code: 'NG-004', name: 'รอยแตกร้าว', type: 'NG' as const },
  ]
  for (const p of problemData) {
    await prisma.problemCategory.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    })
  }

  // 8. Admin User
  await prisma.user.upsert({
    where: { employeeCode: 'ADMIN001' },
    update: {},
    create: {
      employeeCode: 'ADMIN001',
      firstName: 'ผู้ดูแล',
      lastName: 'ระบบ',
      passwordHash: await bcrypt.hash(adminSeedPassword, 10),
      role: 'ADMIN',
      departmentId: deptProd.id,
    },
  })

  // 9. Demo Operator
  await prisma.user.upsert({
    where: { employeeCode: '1-68176' },
    update: {},
    create: {
      employeeCode: '1-68176',
      firstName: 'สมศักดิ์',
      lastName: 'ใจดี',
      passwordHash: await bcrypt.hash(operatorSeedPassword, 10),
      pin: '1234',
      role: 'OPERATOR',
      sectionId: secPD21.id,
      departmentId: deptProd.id,
      divisionId: divMc1.id,
    },
  })

  console.log('✅ Seed completed!')
  console.log('   Seeded users are ready.')

  await seedPermissions(prisma)
  console.log('✅ Permissions seeded from catalog')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
