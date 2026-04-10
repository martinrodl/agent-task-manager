import { prisma } from './prisma'
import { emitTaskEvent } from './sse'
import type { ActorType } from './auth'
import { runAgent } from './agent-runner'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransitionResult {
  task: Awaited<ReturnType<typeof fetchFullTask>>
  event: { id: string; createdAt: Date }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchFullTask(id: string) {
  return prisma.task.findUniqueOrThrow({
    where: { id },
    include: {
      state: true,
      workflow: {
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          transitions: {
            include: { fromState: true, toState: true },
          },
        },
      },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { fromState: true, toState: true },
      },
      subtasks: {
        include: { state: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

// ─── Webhook delivery ─────────────────────────────────────────────────────────

async function fireWebhook(
  webhookUrl: string,
  webhookSecret: string | null | undefined,
  payload: Record<string, unknown>,
) {
  try {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (webhookSecret) headers['X-Webhook-Secret'] = webhookSecret

    const res = await fetch(webhookUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.warn(`[webhook] POST ${webhookUrl} returned ${res.status}`)
    }
  } catch (err) {
    console.error(`[webhook] Failed to deliver to ${webhookUrl}:`, err)
  }
}

// ─── Available transitions for an actor ──────────────────────────────────────

export async function getAvailableTransitions(taskId: string, actorType: ActorType) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { stateId: true, workflowId: true, state: { select: { isTerminal: true } } },
  })

  if (task.state.isTerminal) return []

  return prisma.workflowTransition.findMany({
    where: { workflowId: task.workflowId, fromStateId: task.stateId },
    include: { toState: true },
  }).then(ts => ts.filter(t => t.allowedRoles.includes(actorType)))
}

// ─── Execute transition ───────────────────────────────────────────────────────

export async function executeTransition(
  taskId: string,
  transitionName: string,
  actor: string,
  actorType: ActorType,
  comment?: string,
  result?: unknown,
): Promise<TransitionResult> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { state: true },
  })

  if (task.state.isTerminal) {
    throw new Error(`Task is in terminal state '${task.state.name}' — no further transitions allowed.`)
  }

  const transition = await prisma.workflowTransition.findFirst({
    where: { workflowId: task.workflowId, fromStateId: task.stateId, name: transitionName },
    include: { toState: true },
  })

  if (!transition) {
    throw new Error(`Transition '${transitionName}' not found from state '${task.state.name}'.`)
  }

  if (!transition.allowedRoles.includes(actorType)) {
    throw new Error(
      `Transition '${transitionName}' is not allowed for role '${actorType}'. ` +
      `Allowed roles: ${transition.allowedRoles.join(', ')}.`
    )
  }

  if (transition.requiresComment && !comment?.trim()) {
    throw new Error(`Transition '${transitionName}' requires a comment.`)
  }

  // Auto-assign agent if the target state has one configured
  const autoAssign = transition.toState.agentId

  const [updatedTask, event] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        stateId: transition.toStateId,
        ...(result !== undefined ? { result: result as object } : {}),
        ...(autoAssign ? { assignedTo: autoAssign } : {}),
        updatedAt: new Date(),
      },
    }),
    prisma.taskEvent.create({
      data: {
        taskId,
        fromStateId: task.stateId,
        toStateId: transition.toStateId,
        actor,
        actorType,
        comment: comment ?? null,
        metadata: { transitionName },
      },
    }),
  ])

  const full = await fetchFullTask(updatedTask.id)

  // Broadcast via SSE
  emitTaskEvent({
    type: 'task_transitioned',
    taskId,
    taskTitle: full.title,
    fromState: task.state.name,
    toState: transition.toState.name,
    isBlocking: transition.toState.isBlocking,
    actor,
    actorType,
    workflowId: task.workflowId,
  })

  // Fire webhook if configured on the workflow (fire-and-forget)
  const wf = full.workflow as { webhookUrl?: string | null; webhookSecret?: string | null }
  if (wf.webhookUrl) {
    setImmediate(() => fireWebhook(wf.webhookUrl!, wf.webhookSecret, {
      event:      'task.transitioned',
      timestamp:  new Date().toISOString(),
      taskId,
      taskTitle:  full.title,
      workflowId: task.workflowId,
      fromState:  { name: task.state.name,        label: task.state.label },
      toState:    { name: transition.toState.name, label: transition.toState.label },
      actor,
      actorType,
      comment:    comment ?? null,
      result:     result  ?? null,
    }))
  }

  // Auto-invoke agent if the target state has one configured and it's registered
  if (transition.toState.agentId) {
    const agentName = transition.toState.agentId
    // Fire-and-forget — do not block the API response
    setImmediate(() => {
      runAgent(updatedTask.id, agentName).catch(err =>
        console.error('[state-machine] agent-runner error:', err)
      )
    })
  }

  return { task: full, event: { id: event.id, createdAt: event.createdAt } }
}

// ─── Build task response with HATEOAS links ───────────────────────────────────

export async function buildTaskResponse(taskId: string, actorType: ActorType) {
  const task = await fetchFullTask(taskId)
  const availableTransitions = await getAvailableTransitions(taskId, actorType)

  return {
    ...task,
    _links: {
      self: `/api/v1/tasks/${taskId}`,
      events: `/api/v1/tasks/${taskId}/events`,
      availableTransitions: availableTransitions.map(t => ({
        name: t.name,
        label: t.label,
        toState: t.toState.name,
        toStateLabel: t.toState.label,
        requiresComment: t.requiresComment,
        href: `/api/v1/tasks/${taskId}/transition`,
        method: 'POST',
        body: { transitionName: t.name, comment: t.requiresComment ? '<required>' : undefined },
      })),
    },
  }
}
