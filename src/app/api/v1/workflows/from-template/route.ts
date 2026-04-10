import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'

// POST /api/v1/workflows/from-template
// Body: { templateId: string, name?: string, description?: string }
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.templateId) return NextResponse.json({ error: 'templateId is required' }, { status: 400 })

  const template = WORKFLOW_TEMPLATES.find(t => t.id === body.templateId)
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const workflow = await prisma.workflow.create({
    data: {
      name:        body.name        ?? template.name,
      description: body.description ?? template.description,
    },
  })

  // Create states
  const stateMap: Record<string, string> = {} // templateName → DB id
  for (const s of template.states) {
    const created = await prisma.workflowState.create({
      data: {
        workflowId:        workflow.id,
        name:              s.name,
        label:             s.label,
        color:             s.color,
        isInitial:         s.isInitial  ?? false,
        isTerminal:        s.isTerminal ?? false,
        isBlocking:        s.isBlocking ?? false,
        sortOrder:         s.sortOrder,
        stateInstructions: s.stateInstructions ?? null,
      },
    })
    stateMap[s.name] = created.id
  }

  // Create transitions
  for (const t of template.transitions) {
    const fromId = stateMap[t.fromStateName]
    const toId   = stateMap[t.toStateName]
    if (!fromId || !toId) continue

    await prisma.workflowTransition.create({
      data: {
        workflowId:      workflow.id,
        fromStateId:     fromId,
        toStateId:       toId,
        name:            t.name,
        label:           t.label,
        allowedRoles:    t.allowedRoles,
        requiresComment: t.requiresComment ?? false,
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

  return NextResponse.json(full, { status: 201 })
}
