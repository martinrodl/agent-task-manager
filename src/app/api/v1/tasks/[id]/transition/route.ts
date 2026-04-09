import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { executeTransition } from '@/lib/state-machine'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/tasks/:id/transition
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.transitionName) {
    return NextResponse.json({ error: 'transitionName is required' }, { status: 400 })
  }

  try {
    const result = await executeTransition(
      id,
      body.transitionName,
      auth.actor,
      auth.actorType,
      body.comment,
      body.result,
    )
    return NextResponse.json(result.task)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transition failed'
    return NextResponse.json(
      {
        error: 'TRANSITION_FAILED',
        message,
        details: {
          taskId: id,
          requestedTransition: body.transitionName,
          yourRole: auth.actorType,
        },
      },
      { status: 422 },
    )
  }
}
