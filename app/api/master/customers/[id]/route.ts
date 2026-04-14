import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { customerSchema } from '@/lib/validations/master'
import { checkPermissionForSession } from '@/lib/permissions/guard'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { parts: true } } },
    })
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: customer })
  } catch (error) {
    console.error('GET /api/master/customers/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = customerSchema.partial().safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const customer = await prisma.customer.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ data: customer })
  } catch (error) {
    console.error('PUT /api/master/customers/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canWrite = await checkPermissionForSession(session, 'api.master.write', { apiPath: req.nextUrl.pathname })
  if (!canWrite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const customer = await prisma.customer.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ data: customer })
  } catch (error) {
    console.error('DELETE /api/master/customers/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
