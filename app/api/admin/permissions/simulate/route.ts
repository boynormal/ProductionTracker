import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { API_PERMISSION_KEYS, MENU_PERMISSION_KEYS, PERMISSION_CATALOG_BY_KEY } from '@/lib/permissions/catalog'
import { checkPermission, ensurePermissionCatalogSynced } from '@/lib/permissions/guard'
import { requirePermissionAdmin } from '@/lib/permissions/admin'

const payloadSchema = z.object({
  userId: z.string().min(1),
  context: z
    .object({
      departmentId: z.string().optional(),
      divisionId: z.string().optional(),
      sectionId: z.string().optional(),
      lineId: z.string().optional(),
      machineId: z.string().optional(),
      shiftType: z.enum(['DAY', 'NIGHT']).optional(),
      menuPath: z.string().optional(),
      apiPath: z.string().optional(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  const gate = await requirePermissionAdmin()
  if (!gate.ok) return gate.response

  await ensurePermissionCatalogSynced()
  const parsed = payloadSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, role: true, employeeCode: true, firstName: true, lastName: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const context = parsed.data.context ?? {}
  const menuResults = await Promise.all(
    MENU_PERMISSION_KEYS.map(async (key) => {
      const cat = PERMISSION_CATALOG_BY_KEY.get(key)
      const allowed = await checkPermission({
        userId: user.id,
        role: user.role,
        permissionKey: key,
        context: { ...context, menuPath: cat?.path ?? context.menuPath },
      })
      return { key, path: cat?.path ?? null, allowed }
    }),
  )
  const apiResults = await Promise.all(
    API_PERMISSION_KEYS.map(async (key) => {
      const cat = PERMISSION_CATALOG_BY_KEY.get(key)
      const allowed = await checkPermission({
        userId: user.id,
        role: user.role,
        permissionKey: key,
        context: { ...context, apiPath: cat?.path ?? context.apiPath },
      })
      return { key, path: cat?.path ?? null, method: cat?.method ?? null, allowed }
    }),
  )

  return NextResponse.json({
    data: {
      user,
      context,
      menus: menuResults,
      apis: apiResults,
    },
  })
}

