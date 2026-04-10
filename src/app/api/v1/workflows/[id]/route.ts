import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/workflows/:id
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      states: { orderBy: { sortOrder: 'asc' } },
      transitions: {
        include: { fromState: true, toState: true },
        orderBy: { fromState: { sortOrder: 'asc' } },
      },
      _count: { select: { tasks: true } },
    },
  })

  if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  return NextResponse.json(workflow)
}

// PUT /api/v1/workflows/:id
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ['name', 'description', 'projectId', 'workspaceType', 'workspacePath', 'githubRepo', 'githubBranch', 'githubToken', 'webhookUrl', 'webhookSecret'] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k] === '' ? null : body[k]
  }

  const workflow = await prisma.workflow.update({ where: { id }, data })
  return NextResponse.json(workflow)
}

// DELETE /api/v1/workflows/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.workflow.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
