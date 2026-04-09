import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { callAgent } from '@/lib/agent-connector'

// POST /api/v1/ai/test  — quick connection test for an AI provider
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.providerId) {
    return NextResponse.json({ error: 'providerId is required' }, { status: 400 })
  }

  const provider = await prisma.aiProvider.findUnique({ where: { id: body.providerId } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  if (!provider.enabled) return NextResponse.json({ error: 'Provider is disabled' }, { status: 422 })

  // Warn about missing key for providers that need one
  const needsKey = ['anthropic', 'openai', 'azure', 'openrouter'].includes(provider.provider)
  if (needsKey && !provider.apiKey) {
    return NextResponse.json({
      ok: false,
      error: `Provider "${provider.provider}" requires an API key — none is saved. Edit the provider and enter the key.`,
    }, { status: 422 })
  }

  const start = Date.now()
  try {
    const res = await callAgent(
      {
        provider:    provider.provider,
        baseUrl:     provider.baseUrl ?? '',
        apiKey:      provider.apiKey,
        model:       provider.model,
        maxTokens:   16,
        temperature: 0,
        extraConfig: {},
      },
      [
        { role: 'user', content: 'Reply with the single word: OK' },
      ]
    )
    const ms = Date.now() - start
    return NextResponse.json({
      ok:      true,
      model:   provider.model,
      latency: ms,
      preview: res.content.slice(0, 100),
    })
  } catch (err) {
    const msg = String(err)
    // Surface the raw LLM error so users can diagnose (wrong key, wrong model, etc.)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
