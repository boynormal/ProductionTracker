import { PrismaClient, UserRole } from '@prisma/client'
import { PERMISSION_CATALOG } from '../lib/permissions/catalog'

export async function seedPermissions(prisma: PrismaClient) {
  for (const item of PERMISSION_CATALOG) {
    const permission = await prisma.permission.upsert({
      where: { key: item.key },
      update: {
        name: item.name,
        description: item.description,
        resource: item.resource,
        action: item.action,
        isActive: true,
      },
      create: {
        key: item.key,
        name: item.name,
        description: item.description,
        resource: item.resource,
        action: item.action,
        isActive: true,
      },
    })

    const defaultRoles = item.defaultRoles ?? []
    if (defaultRoles.length === 0) continue

    for (const role of Object.values(UserRole)) {
      if (!defaultRoles.includes(role)) continue
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        update: { effect: 'ALLOW' },
        create: { role, permissionId: permission.id, effect: 'ALLOW' },
      })
    }
  }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    await seedPermissions(prisma)
    console.log('✅ Permission catalog seeded')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

