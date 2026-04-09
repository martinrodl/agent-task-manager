import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { runAgent } from '@/lib/agent-runner'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/tasks/:id/process  — manually trigger agent for current state
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType === 'agent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const task = await prisma.task.findUnique({
    where: { id },
    include: { state: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.state.isTerminal) return NextResponse.json({ error: 'Task is in terminal state' }, { status: 409 })
  if (!task.state.agentId) return NextResponse.json({ error: 'Current state has no agent configured' }, { status: 422 })

  // Fire and return immediately — client polls via SSE
  setImmediate(() => {
    runAgent(id, task.state.agentId!).catch(err =>
      console.error('[process] runAgent error:', err)
    )
  })

  return NextResponse.json({ ok: true, agentName: task.state.agentId, message: 'Agent invoked' })
}
