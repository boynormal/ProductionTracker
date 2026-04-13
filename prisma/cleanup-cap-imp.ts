/**
 * ลบแผนก/ฝ่าย/ส่วน CAP-IMP ที่สร้างจาก import-cap รุ่นเก่า (ถ้ายังมีใน DB)
 * รันครั้งเดียวเมื่อต้องการทำความสะอาด
 *
 *   npm run db:cleanup-cap-imp
 *
 * ถ้ามีสายผลิตหรือผู้ใช้อ้างอิง Section ใต้ CAP-IMP — จะข้ามและแจ้งเตือน
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const dept = await prisma.department.findUnique({ where: { departmentCode: 'CAP-IMP' } })
  if (!dept) {
    console.log('✅ ไม่พบแผนก CAP-IMP — ไม่มีอะไรลบ')
    return
  }

  const div = await prisma.division.findFirst({
    where: { divisionCode: 'CAP-IMP-DIV', departmentId: dept.id },
  })
  if (!div) {
    await prisma.department.delete({ where: { id: dept.id } })
    console.log('✅ ลบแผนก CAP-IMP (ไม่มีฝ่าย CAP-IMP-DIV)')
    return
  }

  const sections = await prisma.section.findMany({ where: { divisionId: div.id } })
  for (const s of sections) {
    const [lc, uc] = await Promise.all([
      prisma.line.count({ where: { sectionId: s.id } }),
      prisma.user.count({ where: { sectionId: s.id } }),
    ])
    if (lc > 0 || uc > 0) {
      console.warn(`⚠️  ข้าม Section ${s.sectionCode}: มีสาย ${lc} / ผู้ใช้ ${uc}`)
      continue
    }
    await prisma.section.delete({ where: { id: s.id } })
    console.log(`   ลบ Section ${s.sectionCode}`)
  }

  const remain = await prisma.section.count({ where: { divisionId: div.id } })
  if (remain > 0) {
    console.warn(`⚠️  ยังมี Section ใต้ CAP-IMP-DIV อีก ${remain} รายการ — ลบฝ่าย/แผนกไม่ได้`)
    return
  }

  await prisma.division.delete({ where: { id: div.id } })
  await prisma.department.delete({ where: { id: dept.id } })
  console.log('✅ ลบ CAP-IMP-DIV และแผนก CAP-IMP แล้ว')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
