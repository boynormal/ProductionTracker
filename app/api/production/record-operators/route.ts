import { NextRequest, NextResponse } from 'next/server'
import { getOperatorContextFromApiRequest } from '@/lib/operator-auth'
import { listEligibleRecordOperators } from '@/lib/user-part-eligibility'

/** รายชื่อผู้ลงชื่อบันทึกที่ Part นี้อนุญาต (ตาม user_part_capabilities) */
export async function GET(req: NextRequest) {
  const ctx = await getOperatorContextFromApiRequest(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partId = new URL(req.url).searchParams.get('partId')
  if (!partId) return NextResponse.json({ error: 'partId required' }, { status: 400 })

  const data = await listEligibleRecordOperators(partId)
  return NextResponse.json({ data })
}
