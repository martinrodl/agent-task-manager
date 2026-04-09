import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/agents
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'asc' } })
  // Strip apiKey from non-human responses
  const safe = agents.map(a => ({
    ...a,
    apiKey: auth.actorType === 'human' ? a.apiKey : undefined,
  }))
  return NextResponse.json(safe)
}

// POST /api/v1/agents
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.baseUrl || !body?.model) {
    return NextResponse.json({ error: 'name, baseUrl, and model are required' }, { status: 400 })
  }

  const agent = await prisma.agent.create({
    data: {
      name:         body.name,
      description:  body.description  ?? null,
      provider:     body.provider     ?? 'openai',
      baseUrl:      body.baseUrl,
      apiKey:       body.apiKey       ?? null,
      model:        body.model,
      systemPrompt: body.systemPrompt ?? null,
      maxTokens:    body.maxTokens    ?? 2048,
      temperature:  body.temperature  ?? 0.7,
      extraConfig:  body.extraConfig  ?? {},
      enabled:      body.enabled      ?? true,
    },
  })

  return NextResponse.json(agent, { status: 201 })
}
