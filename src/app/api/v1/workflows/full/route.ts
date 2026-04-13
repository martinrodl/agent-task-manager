import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

/**
 * POST /api/v1/workflows/full
 *
 * Create a complete workflow (metadata + states + transitions) in one call.
 * Allowed for any authenticated actor (human, agent, orchestrator).
 *
 * Body:
 * {
 *   name: string
 *   description?: string
 *   states: Array<{
 *     name: string          // machine name — auto-uppercased, spaces → _
 *     label: string         // human label
 *     color?: string        // hex, default #6B7280
 *     isInitial?: boolean
 *     isTerminal?: boolean
 *     isBlocking?: boolean  // HITL checkpoint
 *     sortOrder?: number
 *     agentId?: string
 *     completionTransitionName?: string
 *     stateInstructions?: string
 *     spawnWorkflowId?: string
 *     spawnTransitionName?: string
 *   }>
 *   transitions: Array<{
 *     fromStateName: string  // matches state.name above (after uppercasing)
 *     toStateName: string
 *     name: string           // machine name — auto-lowercased
 *     label: string
 *     allowedRoles?: string[] // default ["human", "agent", "orchestrator"]
 *     requiresComment?: boolean
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!Array.isArray(body.states) || body.states.length === 0) {
    return NextResponse.json({ error: 'states array is required and must be non-empty' }, { status: 400 })
  }

  // Resolve projectSlug → projectId if provided
  let projectId: string | null = body.projectId ?? null
  if (!projectId && body.projectSlug) {
    const proj = await prisma.project.findUnique({ where: { slug: body.projectSlug } })
    if (!proj) return NextResponse.json({ error: `Project slug '${body.projectSlug}' not found` }, { status: 404 })
    projectId = proj.id
  }

  const workflow = await prisma.workflow.create({
    data: {
      name:          body.name,
      description:   body.description   ?? null,
      projectId,
      workspaceType: body.workspaceType  ?? null,
      workspacePath: body.workspacePath  ?? null,
      githubRepo:    body.githubRepo     ?? null,
      githubBranch:  body.githubBranch   ?? null,
      githubToken:   body.githubToken    ?? null,
      webhookUrl:    body.webhookUrl     ?? null,
      webhookSecret: body.webhookSecret  ?? null,
      sandboxMode:   body.sandboxMode    ?? null,
      dockerImage:   body.dockerImage    ?? null,
      gitCloneUrl:   body.gitCloneUrl    ?? null,
      setupScript:   body.setupScript    ?? null,
    },
  })

  // Create states — keep a name→id map for wiring up transitions
  const stateMap: Record<string, string> = {}
  for (let i = 0; i < body.states.length; i++) {
    const s = body.states[i]
    const machineName = String(s.name).toUpperCase().replace(/\s+/g, '_')
    const created = await prisma.workflowState.create({
      data: {
        workflowId:              workflow.id,
        name:                    machineName,
        label:                   s.label ?? machineName,
        color:                   s.color ?? '#6B7280',
        isInitial:               s.isInitial  ?? false,
        isTerminal:              s.isTerminal ?? false,
        isBlocking:              s.isBlocking ?? false,
        sortOrder:               s.sortOrder  ?? i,
        agentId:                 s.agentId                 ?? null,
        completionTransitionName: s.completionTransitionName ?? null,
        stateInstructions:       s.stateInstructions       ?? null,
        spawnWorkflowId:         s.spawnWorkflowId         ?? null,
        spawnTransitionName:     s.spawnTransitionName     ?? null,
      },
    })
    stateMap[machineName] = created.id
  }

  // Create transitions
  const transitions: unknown[] = Array.isArray(body.transitions) ? body.transitions : []
  const errors: string[] = []

  for (const t of transitions) {
    const fromName = String((t as { fromStateName: string }).fromStateName).toUpperCase().replace(/\s+/g, '_')
    const toName   = String((t as { toStateName: string }).toStateName).toUpperCase().replace(/\s+/g, '_')
    const fromId   = stateMap[fromName]
    const toId     = stateMap[toName]

    if (!fromId) { errors.push(`Transition '${(t as { name: string }).name}': fromStateName '${fromName}' not found`); continue }
    if (!toId)   { errors.push(`Transition '${(t as { name: string }).name}': toStateName '${toName}' not found`); continue }

    await prisma.workflowTransition.create({
      data: {
        workflowId:      workflow.id,
        fromStateId:     fromId,
        toStateId:       toId,
        name:            String((t as { name: string }).name).toLowerCase().replace(/\s+/g, '_'),
        label:           (t as { label: string }).label ?? (t as { name: string }).name,
        allowedRoles:    (t as { allowedRoles?: string[] }).allowedRoles ?? ['human', 'agent', 'orchestrator'],
        requiresComment: (t as { requiresComment?: boolean }).requiresComment ?? false,
      },
    })
  }

  const full = await prisma.workflow.findUnique({
    where: { id: workflow.id },
    include: {
      states:      { orderBy: { sortOrder: 'asc' } },
      transitions: { include: { fromState: true, toState: true } },
    },
  })

  return NextResponse.json({ ...full, _warnings: errors.length ? errors : undefined }, { status: 201 })
}
