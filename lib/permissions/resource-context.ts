import type { ShiftType } from '@prisma/client'
import type { PermissionCheckContext } from '@/lib/permissions/scope-match'

/** Line hierarchy fields needed to evaluate LINE/SECTION/DIVISION/DEPARTMENT scopes. */
export type LinePermissionSource = {
  id: string
  sectionId: string | null
  section?: {
    divisionId: string
    division?: { departmentId: string } | null
  } | null
}

/**
 * Build a permission check context from a target production line (and optional shift/machine).
 * Scoped ALLOW/DENY rows must see the *resource* hierarchy, not the actor's home section.
 */
export function permissionContextForLine(
  base: PermissionCheckContext,
  line: LinePermissionSource,
  extras?: { machineId?: string | null; shiftType?: ShiftType | null },
): PermissionCheckContext {
  const section = line.section
  return {
    ...base,
    departmentId: section?.division?.departmentId ?? null,
    divisionId: section?.divisionId ?? null,
    sectionId: line.sectionId,
    lineId: line.id,
    machineId: extras?.machineId ?? base.machineId ?? null,
    shiftType: extras?.shiftType ?? base.shiftType ?? null,
  }
}

export const LINE_PERMISSION_SELECT = {
  id: true,
  sectionId: true,
  section: {
    select: {
      divisionId: true,
      division: {
        select: { departmentId: true },
      },
    },
  },
} as const
