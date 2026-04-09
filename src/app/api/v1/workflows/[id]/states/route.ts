import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/workflows/:id/states
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.name || !body?.label) {
    return NextResponse.json({ error: 'name and label are required' }, { status: 400 })
  }

  // Enforce one initial state
  if (body.isInitial) {
    await prisma.workflowState.updateMany({
      where: { workflowId: id, isInitial: true },
      data: { isInitial: false },
    })
  }

  const state = await prisma.workflowState.create({
    data: {
      workflowId:  id,
      name:        body.name.toUpperCase().replace(/\s+/g, '_'),
      label:       body.label,
      color:       body.color ?? '#6B7280',
      isInitial:   body.isInitial  ?? false,
      isTerminal:  body.isTerminal ?? false,
      isBlocking:  body.isBlocking ?? false,
      sortOrder:   body.sortOrder  ?? 0,
    },
  })

  return NextResponse.json(state, { status: 201 })
}

// PUT /api/v1/workflows/:id/states  — bulk replace all states (used by builder)
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body: { id?: string; name: string; label: string; color?: string; isInitial?: boolean; isTerminal?: boolean; isBlocking?: boolean; sortOrder?: number }[] = await req.json()

  // Upsert each state
  const result = await prisma.$transaction(
    body.map((s, i) =>
      prisma.workflowState.upsert({
        where: s.id ? { id: s.id } : { workflowId_name: { workflowId: id, name: s.name.toUpperCase().replace(/\s+/g, '_') } },
        update: {
          label: s.label,
          color: s.color ?? '#6B7280',
          isInitial:  s.isInitial  ?? false,
          isTerminal: s.isTerminal ?? false,
          isBlocking: s.isBlocking ?? false,
          sortOrder:  s.sortOrder  ?? i,
        },
        create: {
          workflowId:  id,
          name:        s.name.toUpperCase().replace(/\s+/g, '_'),
          label:       s.label,
          color:       s.color ?? '#6B7280',
          isInitial:   s.isInitial  ?? false,
          isTerminal:  s.isTerminal ?? false,
          isBlocking:  s.isBlocking ?? false,
          sortOrder:   s.sortOrder  ?? i,
        },
      })
    )
  )

  return NextResponse.json(result)
}

// PATCH /api/v1/workflows/:id/states?stateId=xxx  — update single state fields
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await params
  const stateId = req.nextUrl.searchParams.get('stateId')
  if (!stateId) return NextResponse.json({ error: 'stateId required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['label', 'color', 'isInitial', 'isTerminal', 'isBlocking', 'sortOrder', 'agentId', 'completionTransitionName'] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k] === '' ? null : body[k]
  }

  const state = await prisma.workflowState.update({ where: { id: stateId }, data })
  return NextResponse.json(state)
}

// DELETE /api/v1/workflows/:id/states?stateId=xxx
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await params
  const stateId = req.nextUrl.searchParams.get('stateId')
  if (!stateId) return NextResponse.json({ error: 'stateId required' }, { status: 400 })

  // Check no tasks are in this state
  const count = await prisma.task.count({ where: { stateId } })
  if (count > 0) {
    return NextResponse.json({ error: `Cannot delete: ${count} task(s) are in this state` }, { status: 409 })
  }

  await prisma.workflowState.delete({ where: { id: stateId } })
  return NextResponse.json({ ok: true })
}
