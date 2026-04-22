import type { Prisma } from '@prisma/client'

export function reportingDateRangeWhere(
  from: Date,
  toExclusive: Date,
  withLegacySessionDateFallback: boolean,
): Prisma.ProductionSessionWhereInput {
  if (!withLegacySessionDateFallback) {
    return { reportingDate: { gte: from, lt: toExclusive } }
  }
  return {
    OR: [
      { reportingDate: { gte: from, lt: toExclusive } },
      {
        reportingDate: null,
        sessionDate: { gte: from, lt: toExclusive },
      },
    ],
  }
}

export function reportingDateOrderBy(withLegacySessionDateFallback: boolean): Prisma.ProductionSessionOrderByWithRelationInput[] {
  if (withLegacySessionDateFallback) {
    return [{ sessionDate: 'desc' }, { shiftType: 'asc' }]
  }
  return [{ reportingDate: 'desc' }, { shiftType: 'asc' }]
}
