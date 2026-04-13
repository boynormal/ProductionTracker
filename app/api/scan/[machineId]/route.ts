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

    await prisma.scanLog.create({
      data: {
        machineId: machine.id,
        action: 'OPEN_FORM',
        ipAddress: req.headers.get('x-forwarded-for') ?? 'unknown',
        userAgent: req.headers.get('user-agent') ?? 'unknown',
      },
    })

    return NextResponse.json({ data: machine })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
