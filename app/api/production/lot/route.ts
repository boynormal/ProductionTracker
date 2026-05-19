import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermissionForSession } from '@/lib/permissions/guard'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canView = await checkPermissionForSession(session, 'menu.production.lot', {
    menuPath: '/production/lot',
  })
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const lot = searchParams.get('lot')?.trim()

  if (!lot || lot.length < 1) {
    return NextResponse.json({ error: 'lot query param is required' }, { status: 400 })
  }

  const records = await prisma.hourlyRecord.findMany({
    where: {
      lotNumber: { contains: lot, mode: 'insensitive' },
    },
    include: {
      session: {
        include: {
          line: { select: { id: true, lineCode: true, lineName: true } },
          machine: { select: { id: true, mcNo: true, brand: true } },
        },
      },
      part: {
        include: {
          customer: { select: { id: true, customerCode: true, customerName: true } },
        },
      },
      operator: {
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      },
      breakdownLogs: {
        include: { problemCategory: { select: { id: true, code: true, name: true } } },
      },
      ngLogs: {
        include: { problemCategory: { select: { id: true, code: true, name: true } } },
      },
    },
    orderBy: { recordTime: 'desc' },
    take: 200,
  })

  return NextResponse.json({ data: records, total: records.length })
}
