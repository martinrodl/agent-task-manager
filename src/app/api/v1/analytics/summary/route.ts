import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const sinceParam = searchParams.get('since')
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [totalCalls, successCalls, parseFailed] = await Promise.all([
    prisma.llmCall.count({ where: { createdAt: { gte: since } } }),
    prisma.llmCall.count({ where: { createdAt: { gte: since }, success: true } }),
    prisma.llmCall.count({ where: { createdAt: { gte: since }, success: true, parseSuccess: false } }),
  ])

  const byAgent = await prisma.llmCall.groupBy({
    by: ['agentName'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _avg:   { latencyMs: true, promptTokens: true, completionTokens: true },
    _sum:   { promptTokens: true, completionTokens: true },
    orderBy: { _count: { agentName: 'desc' } },
  })

  const byModel = await prisma.$queryRaw<Array<{
    model: string
    provider: string
    totalCalls: number
    avgLatencyMs: number
    avgPromptTokens: number
  }>>`
    SELECT
      model,
      provider,
      COUNT(*)::int                                        AS "totalCalls",
      ROUND(AVG("latencyMs"))::float8                      AS "avgLatencyMs",
      ROUND(AVG(COALESCE("promptTokens", 0)))::float8      AS "avgPromptTokens"
    FROM "LlmCall"
    WHERE "createdAt" >= ${since}
    GROUP BY model, provider
    ORDER BY "totalCalls" DESC
  `

  const dailyTrend = await prisma.$queryRaw<Array<{
    day: Date
    calls: number
    successRate: number
    avgLatency: number
  }>>`
    SELECT
      DATE_TRUNC('day', "createdAt")                                                          AS day,
      COUNT(*)::int                                                                           AS calls,
      ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 1)::float8        AS "successRate",
      ROUND(AVG("latencyMs"))::float8                                                         AS "avgLatency"
    FROM "LlmCall"
    WHERE "createdAt" >= ${since}
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY day ASC
  `

  return NextResponse.json({
    period: { since: since.toISOString() },
    overview: {
      totalCalls,
      successCalls,
      successRate:      totalCalls > 0 ? Math.round(100 * successCalls / totalCalls) : 0,
      parseFailedCalls: parseFailed,
      errorCalls:       totalCalls - successCalls,
    },
    byAgent: byAgent.map(r => ({
      agentName:             r.agentName,
      totalCalls:            r._count._all,
      avgLatencyMs:          r._avg.latencyMs != null ? Math.round(r._avg.latencyMs) : null,
      avgPromptTokens:       r._avg.promptTokens != null ? Math.round(r._avg.promptTokens) : null,
      avgCompletionTokens:   r._avg.completionTokens != null ? Math.round(r._avg.completionTokens) : null,
      totalPromptTokens:     r._sum.promptTokens ?? 0,
      totalCompletionTokens: r._sum.completionTokens ?? 0,
    })),
    byModel: byModel.map(r => ({
      model:           r.model,
      provider:        r.provider,
      totalCalls:      r.totalCalls,
      avgLatencyMs:    r.avgLatencyMs,
      avgPromptTokens: r.avgPromptTokens,
    })),
    dailyTrend: dailyTrend.map(r => ({
      day:         (r.day as Date).toISOString().split('T')[0],
      calls:       r.calls,
      successRate: r.successRate,
      avgLatency:  r.avgLatency,
    })),
  })
}
