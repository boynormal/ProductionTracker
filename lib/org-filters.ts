import type { Prisma } from '@prisma/client'

/**
 * Section ที่ใช้ใน master (lines / departments) — สอดคล้องกัน ไม่รวมแผนก/ฝ่าง CAP-IMP จาก import เก่า
 */
export const sectionWhereMasterList: Prisma.SectionWhereInput = {
  division: {
    divisionCode: { not: 'CAP-IMP-DIV' },
    department: { departmentCode: { not: 'CAP-IMP' } },
  },
}
