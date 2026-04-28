import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ machineId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { machineId } = await params
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      include: {
        line: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        partTargets: {
          where: { isActive: true },
          include: { part: { include: { customer: true } } },
          orderBy: { part: { partSamco: 'asc' } },
        },
      },
    })

    if (!machine) return NextResponse.json({ error: 'Machine not found' }, { status: 404 })

    const linePartTargets = await prisma.linePartTarget.findMany({
      where: {
        lineId: machine.lineId,
        isActive: true,
      },
      select: { partId: true },
    })
    const allowedPartIds = new Set(linePartTargets.map((row) => row.partId))
    const filteredMachine = {
      ...machine,
      partTargets: machine.partTargets.filter((target) => allowedPartIds.has(target.partId)),
    }

    await prisma.scanLog.create({
      data: {
        machineId: filteredMachine.id,
        action: 'OPEN_FORM',
        ipAddress: req.headers.get('x-forwarded-for') ?? 'unknown',
        userAgent: req.headers.get('user-agent') ?? 'unknown',
      },
    })

    return NextResponse.json({ data: filteredMachine })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
