import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermissionForSession } from '@/lib/permissions/guard'
import type { PermissionCheckContext } from '@/lib/permissions/scope-match'

export type PermissionGuardResult =
  | { ok: true; session: Awaited<ReturnType<typeof auth>> & { user: { id: string; role: string } } }
  | { ok: false; response: NextResponse }

export async function requireApiPermission(
  req: NextRequest,
  permissionKey: string,
  context: PermissionCheckContext = {},
): Promise<PermissionGuardResult> {
  const session = await auth()
  if (!session) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const allowed = await checkPermissionForSession(session, permissionKey, {
    ...context,
    apiPath: req.nextUrl.pathname,
  })
  if (!allowed) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { ok: true, session: session as PermissionGuardResult extends { ok: true; session: infer T } ? T : never }
}

