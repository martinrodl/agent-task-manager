import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { emitTaskEvent } from '@/lib/sse'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/tasks/:id/comments
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, title: true, workflowId: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const event = await prisma.taskEvent.create({
    data: {
      taskId:    id,
      actor:     auth.actor,
      actorType: auth.actorType,
      comment:   body.text.trim(),
      metadata:  { action: 'comment' },
    },
    include: { fromState: true, toState: true },
  })

  emitTaskEvent({
    type:       'task_updated',
    taskId:     id,
    taskTitle:  task.title,
    actor:      auth.actor,
    actorType:  auth.actorType,
    workflowId: task.workflowId,
  })

  return NextResponse.json(event, { status: 201 })
}
