import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/projects
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    include: {
      workflows: {
        include: {
          states: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(projects)
}

// POST /api/v1/projects
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body?.slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

  const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  const existing = await prisma.project.findUnique({ where: { slug } })
  if (existing) return NextResponse.json({ error: `Slug '${slug}' is already taken` }, { status: 409 })

  const project = await prisma.project.create({
    data: {
      name:        body.name,
      slug,
      description: body.description ?? null,
      color:       body.color ?? '#6B7280',
    },
  })

  return NextResponse.json(project, { status: 201 })
}
