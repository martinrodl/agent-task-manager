import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/projects/:id  (id or slug)
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      workflows: {
        include: {
          states:      { orderBy: { sortOrder: 'asc' } },
          transitions: { include: { fromState: true, toState: true } },
          _count:      { select: { tasks: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(project)
}

// PUT /api/v1/projects/:id
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name        !== undefined ? { name:        body.name }        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.color       !== undefined ? { color:       body.color }       : {}),
    },
  })

  return NextResponse.json(project)
}

// DELETE /api/v1/projects/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Detach workflows first (set projectId = null)
  await prisma.workflow.updateMany({ where: { projectId: id }, data: { projectId: null } })
  await prisma.project.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
