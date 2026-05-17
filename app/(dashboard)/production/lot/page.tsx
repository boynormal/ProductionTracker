import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LotClient } from './LotClient'

export default async function LotPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <LotClient userRole={session.user?.role} />
}
