import { prisma } from '@/lib/prisma'

/** ไม่มีรายการรุ่น = ใช้ได้ทุก Part; มีรายการ = ต้องมี Part นั้น */
export async function isUserEligibleForPart(userId: string, partId: string): Promise<boolean> {
  const n = await prisma.userPartCapability.count({ where: { userId } })
  if (n === 0) return true
  const row = await prisma.userPartCapability.findUnique({
    where: { userId_partId: { userId, partId } },
  })
  return !!row
}

export type RecordOperatorOption = {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
}

/** ผู้ใช้ที่ลงชื่อบันทึกได้สำหรับ Part นี้ (OPERATOR / SUPERVISOR) */
export async function listEligibleRecordOperators(partId: string): Promise<RecordOperatorOption[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['OPERATOR', 'SUPERVISOR'] },
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      capableParts: { select: { partId: true } },
    },
    orderBy: { employeeCode: 'asc' },
  })
  return users
    .filter(u => {
      if (u.capableParts.length === 0) return true
      return u.capableParts.some(c => c.partId === partId)
    })
    .map(({ capableParts: _c, ...rest }) => rest)
}
