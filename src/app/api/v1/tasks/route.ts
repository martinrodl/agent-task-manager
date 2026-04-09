import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { buildTaskResponse } from '@/lib/state-machine'
import { emitTaskEvent } from '@/lib/sse'
import { runAgent } from '@/lib/agent-runner'

// GET /api/v1/tasks
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const workflowId  = searchParams.get('workflowId') ?? undefined
  const stateId     = searchParams.get('stateId') ?? undefined
  const assignedTo  = searchParams.get('assignedTo') ?? undefined
  const isBlocking  = searchParams.get('blocking') === 'true' ? true : undefined
  const limit       = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset      = Number(searchParams.get('offset') ?? 0)

  const tasks = await prisma.task.findMany({
    where: {
      ...(workflowId  ? { workflowId }  : {}),
      ...(stateId     ? { stateId }     : {}),
      ...(assignedTo  ? { assignedTo }  : {}),
      ...(isBlocking !== undefined ? { state: { isBlocking } } : {}),
    },
    include: {
      state: true,
      workflow: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    skip: offset,
  })

  const total = await prisma.task.count({
    where: {
      ...(workflowId  ? { workflowId }  : {}),
      ...(stateId     ? { stateId }     : {}),
      ...(assignedTo  ? { assignedTo }  : {}),
      ...(isBlocking !== undefined ? { state: { isBlocking } } : {}),
    },
  })

  return NextResponse.json({ data: tasks, total, limit, offset })
}

// POST /api/v1/tasks
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.workflowId || !body?.title) {
    return NextResponse.json({ error: 'workflowId and title are required' }, { status: 400 })
  }

  // Find initial state
  const initialState = await prisma.workflowState.findFirst({
    where: { workflowId: body.workflowId, isInitial: true },
  })
  if (!initialState) {
    return NextResponse.json({ error: 'Workflow has no initial state defined' }, { status: 422 })
  }

  const task = await prisma.task.create({
    data: {
      workflowId:  body.workflowId,
      stateId:     initialState.id,
      title:       body.title,
      description: body.description ?? null,
      context:     body.context ?? {},
      assignedTo:  body.assignedTo ?? null,
      priority:    body.priority ?? 0,
      dueAt:       body.dueAt ? new Date(body.dueAt) : null,
      createdBy:   auth.actor,
    },
  })

  // Log creation event
  await prisma.taskEvent.create({
    data: {
      taskId:     task.id,
      toStateId:  initialState.id,
      actor:      auth.actor,
      actorType:  auth.actorType,
      metadata:   { action: 'created' },
    },
  })

  emitTaskEvent({
    type: 'task_created',
    taskId: task.id,
    taskTitle: task.title,
    toState: initialState.name,
    actor: auth.actor,
    actorType: auth.actorType,
    workflowId: task.workflowId,
  })

  // Auto-invoke agent if initial state has one configured
  if (initialState.agentId) {
    const agentName = initialState.agentId
    setImmediate(() => {
      runAgent(task.id, agentName).catch(err =>
        console.error('[tasks] agent-runner error on create:', err)
      )
    })
  }

  const full = await buildTaskResponse(task.id, auth.actorType)
  return NextResponse.json(full, { status: 201 })
}
