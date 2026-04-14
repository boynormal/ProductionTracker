import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { checkPermissionForSession, ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { LogsClient } from './LogsLoader'

export default async function AdminLogsPage() {
  const session = await auth()
  if (!session) redirect('/')

  await ensurePermissionCatalogSynced()

  const canView = await checkPermissionForSession(session, 'menu.admin.logs', { menuPath: '/admin/logs' })
  if (!canView) redirect('/')

  return <LogsClient />
}

