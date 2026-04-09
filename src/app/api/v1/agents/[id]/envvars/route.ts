import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET — list env vars assigned to agent (keys only, no values)
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const rows = await prisma.agentEnvVar.findMany({
    where: { agentId: id },
    include: { envVar: true },
  })
  return NextResponse.json(rows.map(r => ({ ...r.envVar, value: '••••••••' })))
}

// PUT — replace full env var list  { envVarIds: string[] }
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { envVarIds = [] } = await req.json().catch(() => ({ envVarIds: [] }))

  await prisma.$transaction([
    prisma.agentEnvVar.deleteMany({ where: { agentId: id } }),
    ...envVarIds.map((envVarId: string) =>
      prisma.agentEnvVar.create({ data: { agentId: id, envVarId } })
    ),
  ])
  return NextResponse.json({ ok: true })
}
