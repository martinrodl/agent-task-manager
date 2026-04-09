import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const skills = await prisma.skill.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(skills)
}

export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.content) return NextResponse.json({ error: 'name and content are required' }, { status: 400 })

  const skill = await prisma.skill.create({
    data: {
      name:        body.name,
      description: body.description ?? null,
      icon:        body.icon        ?? '🔧',
      content:     body.content,
    },
  })
  return NextResponse.json(skill, { status: 201 })
}
