/**
 * ชื่อฝ่ายมาตรฐานสำหรับ master — แก้ค่าผิดจากนำเข้าเก่าให้ตรงองค์กรจริง
 */
export function canonicalDivisionName(name: string | null | undefined): string | null {
  if (name == null) return null
  const t = name.trim()
  if (t === '') return null
  if (t === 'CAP Section PD1') return 'Forge Section PD1'
  return t
}
