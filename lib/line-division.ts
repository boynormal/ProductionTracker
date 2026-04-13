import { prisma } from '@/lib/prisma'
import { sectionWhereMasterList } from '@/lib/org-filters'

/** ดึง divisionCode จาก Section (สำหรับเก็บบน Line — ไม่มี FK) */
export async function divisionCodeForSectionId(
  sectionId: string | null | undefined,
): Promise<string | null> {
  if (!sectionId) return null
  const sec = await prisma.section.findFirst({
    where: { id: sectionId, isActive: true, ...sectionWhereMasterList },
    include: { division: { select: { divisionCode: true } } },
  })
  return sec?.division?.divisionCode ?? null
}
