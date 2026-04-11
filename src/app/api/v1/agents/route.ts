import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/agents
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' },
    include: { aiProvider: { select: { id: true, name: true, model: true, provider: true } } },
  })
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
  if (!body?.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!body.aiProviderId && !body.model) {
    return NextResponse.json({ error: 'model is required (or select an AI provider)' }, { status: 400 })
  }

  const agent = await prisma.agent.create({
    data: {
      name:         body.name,
      description:  body.description  ?? null,
      apiToken:     body.apiToken     ?? null,
      aiProviderId: body.aiProviderId  ?? null,
      provider:     body.provider     ?? 'openai',
      baseUrl:      body.baseUrl      ?? null,
      apiKey:       body.apiKey       ?? null,
      model:        body.model        ?? null,
      systemPrompt: body.systemPrompt ?? null,
      maxTokens:    body.maxTokens    ?? 2048,
      temperature:  body.temperature  ?? 0.7,
      extraConfig:   body.extraConfig   ?? {},
      enabled:       body.enabled       ?? true,
      tools:         body.tools         ?? [],
      maxIterations: body.maxIterations ?? 20,
    },
    include: { aiProvider: { select: { id: true, name: true, model: true, provider: true } } },
  })

  return NextResponse.json(agent, { status: 201 })
}
