import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { buildTaskResponse } from '@/lib/state-machine'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/tasks/:id
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const task = await buildTaskResponse(id, auth.actorType)
    return NextResponse.json(task)
  } catch {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
}

// PATCH /api/v1/tasks/:id  — update metadata only (not state)
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ['title', 'description', 'assignedTo', 'priority', 'dueAt', 'context', 'result'] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k]
  }

  try {
    await prisma.task.update({ where: { id }, data })
    const task = await buildTaskResponse(id, auth.actorType)
    return NextResponse.json(task)
  } catch {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
}
