import type { PermissionScopeType, ShiftType } from '@prisma/client'

export type PermissionCheckContext = {
  departmentId?: string | null
  divisionId?: string | null
  sectionId?: string | null
  lineId?: string | null
  machineId?: string | null
  shiftType?: ShiftType | null
  menuPath?: string | null
  apiPath?: string | null
}

function normalize(v: string | null | undefined): string {
  return String(v ?? '').trim()
}

function exactValueMatch(actual: string | null | undefined, expected: string | null | undefined): boolean {
  const normalizedActual = normalize(actual)
  const normalizedExpected = normalize(expected)
  return Boolean(normalizedActual && normalizedExpected && normalizedActual === normalizedExpected)
}

function pathMatch(actualPath: string, expectedPrefix: string): boolean {
  const a = normalize(actualPath)
  const b = normalize(expectedPrefix)
  if (!a || !b) return false
  return a === b || a.startsWith(`${b}/`)
}

export function scopeMatches(
  scopeType: PermissionScopeType,
  scopeValue: string | null | undefined,
  context: PermissionCheckContext,
): boolean {
  switch (scopeType) {
    case 'GLOBAL':
      return true
    case 'DEPARTMENT':
      return exactValueMatch(context.departmentId, scopeValue)
    case 'DIVISION':
      return exactValueMatch(context.divisionId, scopeValue)
    case 'SECTION':
      return exactValueMatch(context.sectionId, scopeValue)
    case 'LINE':
      return exactValueMatch(context.lineId, scopeValue)
    case 'MACHINE':
      return exactValueMatch(context.machineId, scopeValue)
    case 'SHIFT':
      return normalize(context.shiftType) === normalize(scopeValue)
    case 'MENU':
      return pathMatch(normalize(context.menuPath), normalize(scopeValue))
    case 'API':
      return pathMatch(normalize(context.apiPath), normalize(scopeValue))
    default:
      return false
  }
}

