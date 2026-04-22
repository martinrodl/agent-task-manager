import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/review/queue
// Returns tasks in blocking states (HITL checkpoints)
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workflowId = req.nextUrl.searchParams.get('workflowId') ?? undefined
  const limit  = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit')  ?? '50', 10) || 50, 1), 200)
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get('offset') ?? '0',  10) || 0, 0)

  const where = {
    state: { isBlocking: true } as const,
    ...(workflowId ? { workflowId } : {}),
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
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
      take: limit,
      skip: offset,
    }),
    prisma.task.count({ where }),
  ])

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

  return NextResponse.json({ data: enriched, total, limit, offset })
}
