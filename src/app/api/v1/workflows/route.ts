import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/workflows
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workflows = await prisma.workflow.findMany({
    include: {
      states: { orderBy: { sortOrder: 'asc' } },
      transitions: { include: { fromState: true, toState: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(workflows)
}

// POST /api/v1/workflows
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') {
    return NextResponse.json({ error: 'Only humans can create workflows' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const workflow = await prisma.workflow.create({
    data: { name: body.name, description: body.description ?? null },
  })

  return NextResponse.json(workflow, { status: 201 })
}
