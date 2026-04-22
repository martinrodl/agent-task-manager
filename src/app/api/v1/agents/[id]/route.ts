import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { callAgent } from '@/lib/agent-connector'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/agents/:id
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { aiProvider: { select: { id: true, name: true, model: true, provider: true } } },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ...agent,
    apiKey:   auth.actorType === 'human' ? agent.apiKey   : undefined,
    apiToken: auth.actorType === 'human' ? agent.apiToken : undefined,
  })
}

// PATCH /api/v1/agents/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ['name','description','apiToken','aiProviderId','provider','baseUrl','apiKey','model','systemPrompt','maxTokens','temperature','extraConfig','enabled','tools','maxIterations'] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k] === '' ? null : body[k]
  }

  const agent = await prisma.agent.update({
    where: { id },
    data,
    include: { aiProvider: { select: { id: true, name: true, model: true, provider: true } } },
  })
  return NextResponse.json(agent)
}

// DELETE /api/v1/agents/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.agent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// POST /api/v1/agents/:id/test  — quick connectivity test
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { aiProvider: true },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const llm = agent.aiProvider ?? agent
  try {
    const res = await callAgent(
      {
        provider:    llm.provider,
        baseUrl:     llm.baseUrl ?? '',
        apiKey:      llm.apiKey,
        model:       llm.model ?? '',
        maxTokens:   64,
        temperature: 0,
        extraConfig: agent.extraConfig as Record<string, unknown>,
      },
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user',   content: 'Reply with only: {"ok":true}' },
      ]
    )
    return NextResponse.json({ ok: true, response: res.content.slice(0, 200) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
