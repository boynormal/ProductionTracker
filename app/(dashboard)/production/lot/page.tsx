import { auth } from '@/lib/auth'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import { redirect } from 'next/navigation'
import { LotClient } from './LotClient'

export default async function LotPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const canView = await checkPermissionForSession(session, 'menu.production.lot', {
    menuPath: '/production/lot',
  })
  if (!canView) redirect('/')

  return <LotClient userRole={session.user?.role} />
}
