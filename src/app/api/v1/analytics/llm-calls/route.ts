import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const taskId     = searchParams.get('taskId')    ?? undefined
  const agentName  = searchParams.get('agentName') ?? undefined
  const onlyFailed = searchParams.get('failed') === 'true'
  const limit      = Math.min(Number(searchParams.get('limit')  ?? 50), 200)
  const offset     = Number(searchParams.get('offset') ?? 0)

  const where = {
    ...(taskId    ? { taskId }    : {}),
    ...(agentName ? { agentName } : {}),
    ...(onlyFailed ? { OR: [{ success: false }, { parseSuccess: false }] } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.llmCall.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    offset,
      select: {
        id: true, taskId: true, agentName: true,
        provider: true, model: true,
        success: true, parseSuccess: true,
        errorMessage: true, parsedTransition: true,
        latencyMs: true, promptTokens: true, completionTokens: true,
        createdAt: true, taskEventId: true,
        task: { select: { title: true } },
      },
    }),
    prisma.llmCall.count({ where }),
  ])

  return NextResponse.json({ data, total, limit, offset })
}
