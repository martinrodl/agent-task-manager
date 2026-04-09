import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/workflows/:id/transitions
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.fromStateId || !body?.toStateId || !body?.name || !body?.label) {
    return NextResponse.json(
      { error: 'fromStateId, toStateId, name and label are required' },
      { status: 400 }
    )
  }

  const transition = await prisma.workflowTransition.create({
    data: {
      workflowId:     id,
      fromStateId:    body.fromStateId,
      toStateId:      body.toStateId,
      name:           body.name.toLowerCase().replace(/\s+/g, '_'),
      label:          body.label,
      allowedRoles:   body.allowedRoles ?? ['human'],
      requiresComment: body.requiresComment ?? false,
    },
    include: { fromState: true, toState: true },
  })

  return NextResponse.json(transition, { status: 201 })
}

// PUT /api/v1/workflows/:id/transitions/:transitionId
// Handled via query param for simplicity
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await params
  const transitionId = req.nextUrl.searchParams.get('transitionId')
  if (!transitionId) return NextResponse.json({ error: 'transitionId required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  const transition = await prisma.workflowTransition.update({
    where: { id: transitionId },
    data: {
      ...(body.label           !== undefined ? { label: body.label }                     : {}),
      ...(body.allowedRoles    !== undefined ? { allowedRoles: body.allowedRoles }       : {}),
      ...(body.requiresComment !== undefined ? { requiresComment: body.requiresComment } : {}),
    },
    include: { fromState: true, toState: true },
  })

  return NextResponse.json(transition)
}

// DELETE /api/v1/workflows/:id/transitions?transitionId=xxx
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await params
  const transitionId = req.nextUrl.searchParams.get('transitionId')
  if (!transitionId) return NextResponse.json({ error: 'transitionId required' }, { status: 400 })

  await prisma.workflowTransition.delete({ where: { id: transitionId } })
  return NextResponse.json({ ok: true })
}
