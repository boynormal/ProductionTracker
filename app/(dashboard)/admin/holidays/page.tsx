import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { HolidaysClient } from './HolidaysLoader'

export default async function HolidaysPage() {
  const session = await auth()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/')

  const holidays = await prisma.holiday.findMany({
    where: { isActive: true },
    orderBy: { date: 'asc' },
  })

  return <HolidaysClient holidays={JSON.parse(JSON.stringify(holidays))} />
}
