import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET — list skills assigned to agent
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const rows = await prisma.agentSkill.findMany({
    where: { agentId: id },
    include: { skill: true },
  })
  return NextResponse.json(rows.map(r => r.skill))
}

// PUT — replace full skill list  { skillIds: string[] }
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { skillIds = [] } = await req.json().catch(() => ({ skillIds: [] }))

  await prisma.$transaction([
    prisma.agentSkill.deleteMany({ where: { agentId: id } }),
    ...skillIds.map((skillId: string) =>
      prisma.agentSkill.create({ data: { agentId: id, skillId } })
    ),
  ])
  return NextResponse.json({ ok: true })
}
