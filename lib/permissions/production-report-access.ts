import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'

const reportLineSelect = {
  id: true,
  sectionId: true,
  section: {
    select: {
      divisionId: true,
      division: { select: { departmentId: true } },
    },
  },
} satisfies Prisma.LineSelect

type ReportSession = Parameters<typeof checkPermissionForSession>[0]
type ReportLine = Prisma.LineGetPayload<{ select: typeof reportLineSelect }>

type ReportLineAccessOptions = {
  apiPath?: string
  where?: Prisma.LineWhereInput
}

export async function getProductionReportLineAccess(
  session: ReportSession,
  options: ReportLineAccessOptions = {},
): Promise<{ globalAllowed: boolean; lines: ReportLine[] }> {
  const baseContext = {
    menuPath: '/production/report',
    apiPath: options.apiPath,
  }

  const [globalAllowed, lines] = await Promise.all([
    checkPermissionForSession(session, 'menu.production.report', baseContext),
    prisma.line.findMany({
      where: options.where,
      select: reportLineSelect,
    }),
  ])

  const linePermissions = await Promise.all(
    lines.map((line) =>
      checkPermissionForSession(session, 'menu.production.report', {
        ...baseContext,
        lineId: line.id,
        sectionId: line.sectionId,
        divisionId: line.section?.divisionId,
        departmentId: line.section?.division.departmentId,
      }),
    ),
  )

  return {
    globalAllowed,
    lines: lines.filter((_, index) => linePermissions[index]),
  }
}
