import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/review/queue
// Returns tasks in blocking states (HITL checkpoints)
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workflowId = req.nextUrl.searchParams.get('workflowId') ?? undefined

  const tasks = await prisma.task.findMany({
    where: {
      state: { isBlocking: true },
      ...(workflowId ? { workflowId } : {}),
    },
    include: {
      state: true,
      workflow: { select: { id: true, name: true } },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { fromState: true },
      },
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'asc' }],
  })

  // Enrich each task with available human transitions
  const enriched = await Promise.all(
    tasks.map(async (task) => {
      const transitions = await prisma.workflowTransition.findMany({
        where: { fromStateId: task.stateId, allowedRoles: { has: 'human' } },
        include: { toState: true },
      })
      return { ...task, humanTransitions: transitions }
    })
  )

  return NextResponse.json({ data: enriched, total: enriched.length })
}
