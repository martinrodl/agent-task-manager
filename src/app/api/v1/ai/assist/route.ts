import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { callAgent } from '@/lib/agent-connector'

const SKILL_PROMPT = (desc: string) => `Generate a skill definition for an AI agent based on this description: "${desc}"

A "skill" is a block of Markdown instructions injected into the agent's system prompt.
Make the instructions detailed, practical, and actionable for an AI agent.

Respond with JSON only — no markdown fences, no prose:
{
  "name": "snake_case_name",
  "icon": "single_emoji",
  "description": "one line description (max 80 chars)",
  "content": "detailed markdown instructions for the agent (200-600 words)"
}`

const WORKFLOW_PROMPT = (desc: string) => `Generate a workflow definition for an AI-powered task management system.

Description: "${desc}"

Rules:
- Exactly one state must have isInitial: true
- At least one state must have isTerminal: true
- isBlocking: true = HITL checkpoint (human must approve before agent continues)
- allowedRoles: array of "agent", "human", "orchestrator" (who can trigger the transition)
- Use these colors: #9CA3AF #60A5FA #F59E0B #8B5CF6 #EF4444 #10B981 #F97316 #EC4899
- Transitions reference states by name (fromStateName / toStateName)

Respond with JSON only — no markdown fences, no prose:
{
  "name": "Workflow Name",
  "description": "one line description",
  "states": [
    { "name": "MACHINE_NAME", "label": "Human Label", "color": "#hex", "isInitial": false, "isTerminal": false, "isBlocking": false, "sortOrder": 0 }
  ],
  "transitions": [
    { "name": "transition_name", "label": "Human Label", "fromStateName": "FROM", "toStateName": "TO", "allowedRoles": ["human"], "requiresComment": false }
  ]
}`

function parseJSON(raw: string) {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(clean) }
  catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) try { return JSON.parse(m[0]) } catch { /* ignore */ }
  }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.type || !body?.prompt) {
    return NextResponse.json({ error: 'type and prompt are required' }, { status: 400 })
  }
  if (!['skill', 'workflow'].includes(body.type)) {
    return NextResponse.json({ error: 'type must be skill or workflow' }, { status: 400 })
  }

  // Find AI provider (explicit id or default)
  const provider = body.providerId
    ? await prisma.aiProvider.findUnique({ where: { id: body.providerId } })
    : await prisma.aiProvider.findFirst({ where: { isDefault: true, enabled: true } })
      ?? await prisma.aiProvider.findFirst({ where: { enabled: true } })

  if (!provider) {
    return NextResponse.json({ error: 'No AI provider configured. Go to Settings → AI Providers.' }, { status: 422 })
  }

  const systemPrompt = 'You are an expert AI system designer. Generate precise, structured JSON definitions. Never include explanation, only JSON.'
  const userPrompt   = body.type === 'skill' ? SKILL_PROMPT(body.prompt) : WORKFLOW_PROMPT(body.prompt)

  let raw: string
  try {
    const res = await callAgent(
      {
        provider:    provider.provider,
        baseUrl:     provider.baseUrl ?? '',
        apiKey:      provider.apiKey,
        model:       provider.model,
        maxTokens:   2048,
        temperature: 0.3,
        extraConfig: {},
      },
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ]
    )
    raw = res.content
  } catch (err) {
    return NextResponse.json({ error: `AI call failed: ${String(err)}` }, { status: 502 })
  }

  const parsed = parseJSON(raw)
  if (!parsed) {
    return NextResponse.json({ error: 'AI returned unparseable response', raw: raw.slice(0, 500) }, { status: 422 })
  }

  return NextResponse.json({ type: body.type, result: parsed })
}
