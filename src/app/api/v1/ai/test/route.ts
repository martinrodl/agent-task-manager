import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { callAgent } from '@/lib/agent-connector'

// POST /api/v1/ai/test
// Accepts either:
//   { providerId: "..." }            — test a saved provider by ID
//   { provider, baseUrl, apiKey, model } — test inline (form values, not yet saved)
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  let cfg: { provider: string; baseUrl: string | null; apiKey: string | null; model: string }

  if (body.providerId) {
    // Test a saved provider
    const p = await prisma.aiProvider.findUnique({ where: { id: body.providerId } })
    if (!p) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    cfg = { provider: p.provider, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model }
  } else if (body.provider && body.model) {
    // Test inline (form values before saving)
    cfg = { provider: body.provider, baseUrl: body.baseUrl || null, apiKey: body.apiKey || null, model: body.model }
  } else {
    return NextResponse.json({ error: 'Provide either providerId or {provider, model}' }, { status: 400 })
  }

  const needsKey = ['anthropic', 'openai', 'azure', 'openrouter'].includes(cfg.provider)
  if (needsKey && !cfg.apiKey) {
    return NextResponse.json({
      ok: false,
      error: `"${cfg.provider}" requires an API key — enter it in the API Key field.`,
    }, { status: 422 })
  }

  const start = Date.now()
  try {
    const res = await callAgent(
      { provider: cfg.provider, baseUrl: cfg.baseUrl ?? '', apiKey: cfg.apiKey, model: cfg.model, maxTokens: 16, temperature: 0, extraConfig: {} },
      [{ role: 'user', content: 'Reply with the single word: OK' }]
    )
    return NextResponse.json({ ok: true, model: cfg.model, latency: Date.now() - start, preview: res.content.slice(0, 100) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
