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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <HolidaysClient
        holidays={JSON.parse(JSON.stringify(holidays))}
        canEdit={session.user.role === 'ADMIN'}
      />
    </div>
  )
}
