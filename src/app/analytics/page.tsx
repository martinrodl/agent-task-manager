'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/nav'
import { formatDate, timeAgo } from '@/lib/utils'
import Link from 'next/link'

interface AgentStat {
  agentName: string
  totalCalls: number
  avgLatencyMs: number | null
  avgPromptTokens: number | null
  avgCompletionTokens: number | null
  totalPromptTokens: number
  totalCompletionTokens: number
}

interface ModelStat {
  model: string
  provider: string
  totalCalls: number
  avgLatencyMs: number
}

interface DayTrend {
  day: string
  calls: number
  successRate: number
  avgLatency: number
}

interface Overview {
  totalCalls: number
  successCalls: number
  successRate: number
  parseFailedCalls: number
  errorCalls: number
}

interface Summary {
  period: { since: string }
  overview: Overview
  byAgent: AgentStat[]
  byModel: ModelStat[]
  dailyTrend: DayTrend[]
}

interface LlmCallRow {
  id: string
  taskId: string
  agentName: string
  model: string
  provider: string
  success: boolean
  parseSuccess: boolean
  errorMessage: string | null
  parsedTransition: string | null
  latencyMs: number
  promptTokens: number | null
  completionTokens: number | null
  createdAt: string
  task: { title: string } | null
}

export default function AnalyticsPage() {
  const [summary, setSummary]       = useState<Summary | null>(null)
  const [calls, setCalls]           = useState<LlmCallRow[]>([])
  const [total, setTotal]           = useState(0)
  const [loadingSummary, setLS]     = useState(true)
  const [loadingCalls, setLC]       = useState(true)
  const [onlyFailed, setFailed]     = useState(false)
  const [agentFilter, setAgent]     = useState('')
  const [page, setPage]             = useState(0)
  const limit = 20

  useEffect(() => {
    setLS(true)
    fetch('/api/v1/analytics/summary')
      .then(r => r.json())
      .then(setSummary)
      .finally(() => setLS(false))
  }, [])

  useEffect(() => {
    setLC(true)
    const params = new URLSearchParams({
      limit:  String(limit),
      offset: String(page * limit),
      ...(onlyFailed   ? { failed:    'true' }      : {}),
      ...(agentFilter  ? { agentName: agentFilter } : {}),
    })
    fetch(`/api/v1/analytics/llm-calls?${params}`)
      .then(r => r.json())
      .then(d => { setCalls(d.data); setTotal(d.total) })
      .finally(() => setLC(false))
  }, [onlyFailed, agentFilter, page])

  const ov = summary?.overview

  return (
    <div className="flex h-full">
      <Nav />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            {summary && (
              <p className="text-sm text-gray-500 mt-1">
                LLM call metrics — last 7 days (since {formatDate(summary.period.since)})
              </p>
            )}
          </div>

          {/* Overview cards */}
          {loadingSummary ? (
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse bg-gray-50" />
              ))}
            </div>
          ) : ov ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <MetricCard label="Total LLM calls"  value={ov.totalCalls}        color="blue" />
              <MetricCard label="Success rate"      value={`${ov.successRate}%`} color="green" />
              <MetricCard label="LLM errors"        value={ov.errorCalls}        color="red" />
              <MetricCard label="Parse failures"    value={ov.parseFailedCalls}  color="amber" />
            </div>
          ) : null}

          {/* Per-agent table */}
          {!loadingSummary && summary && summary.byAgent.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">Performance by agent</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Agent</th>
                      <th className="text-right pb-2 font-medium">Calls</th>
                      <th className="text-right pb-2 font-medium">Avg latency</th>
                      <th className="text-right pb-2 font-medium">Avg input tok</th>
                      <th className="text-right pb-2 font-medium">Avg output tok</th>
                      <th className="text-right pb-2 font-medium">Total tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.byAgent.map(row => (
                      <tr key={row.agentName} className="hover:bg-gray-50">
                        <td className="py-2.5 font-mono text-gray-900 text-xs">{row.agentName}</td>
                        <td className="py-2.5 text-right text-gray-700">{row.totalCalls}</td>
                        <td className="py-2.5 text-right text-gray-700">
                          {row.avgLatencyMs != null ? `${row.avgLatencyMs}ms` : '—'}
                        </td>
                        <td className="py-2.5 text-right text-gray-500">
                          {row.avgPromptTokens ?? '—'}
                        </td>
                        <td className="py-2.5 text-right text-gray-500">
                          {row.avgCompletionTokens ?? '—'}
                        </td>
                        <td className="py-2.5 text-right text-gray-700 tabular-nums">
                          {(row.totalPromptTokens + row.totalCompletionTokens).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily trend */}
          {!loadingSummary && summary && summary.dailyTrend.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">Daily trend</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Day</th>
                      <th className="text-right pb-2 font-medium">Calls</th>
                      <th className="text-right pb-2 font-medium">Success rate</th>
                      <th className="text-right pb-2 font-medium">Avg latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.dailyTrend.map(row => (
                      <tr key={row.day} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-700 tabular-nums">{row.day}</td>
                        <td className="py-2 text-right text-gray-700">{row.calls}</td>
                        <td className="py-2 text-right">
                          <span className={`text-xs font-medium ${row.successRate >= 90 ? 'text-green-600' : row.successRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {row.successRate}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-gray-500">{row.avgLatency}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LLM call log */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">LLM call log</h2>
              <div className="flex items-center gap-3">
                <input
                  value={agentFilter}
                  onChange={e => { setAgent(e.target.value); setPage(0) }}
                  placeholder="Filter by agent…"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyFailed}
                    onChange={e => { setFailed(e.target.checked); setPage(0) }}
                  />
                  Failures only
                </label>
              </div>
            </div>

            {loadingCalls ? (
              <p className="text-sm text-gray-400 py-4">Loading…</p>
            ) : calls.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-400 text-sm">No LLM calls recorded yet.</p>
                <p className="text-gray-400 text-xs mt-1">Calls will appear here after agents run.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium">Task</th>
                        <th className="text-left pb-2 font-medium">Agent</th>
                        <th className="text-left pb-2 font-medium">Model</th>
                        <th className="text-right pb-2 font-medium">Latency</th>
                        <th className="text-right pb-2 font-medium">Tokens</th>
                        <th className="text-left pb-2 font-medium">Status</th>
                        <th className="text-right pb-2 font-medium">When</th>
                        <th className="text-right pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {calls.map(call => {
                        const totalTok = (call.promptTokens ?? 0) + (call.completionTokens ?? 0)
                        const ok = call.success && call.parseSuccess
                        return (
                          <tr key={call.id} className="hover:bg-gray-50">
                            <td className="py-2.5 max-w-[180px]">
                              <Link href={`/tasks/${call.taskId}`} className="text-blue-600 hover:underline truncate block text-xs">
                                {call.task?.title ?? call.taskId.slice(0, 8) + '…'}
                              </Link>
                            </td>
                            <td className="py-2.5 font-mono text-gray-700 text-xs">{call.agentName}</td>
                            <td className="py-2.5 text-gray-500 text-xs">{call.model}</td>
                            <td className="py-2.5 text-right tabular-nums text-xs">{call.latencyMs}ms</td>
                            <td className="py-2.5 text-right tabular-nums text-gray-500 text-xs">
                              {totalTok > 0 ? totalTok.toLocaleString() : '—'}
                            </td>
                            <td className="py-2.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                ok
                                  ? 'bg-green-100 text-green-700'
                                  : !call.success
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}>
                                {ok ? 'ok' : !call.success ? 'error' : 'parse-fail'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                              {timeAgo(call.createdAt)}
                            </td>
                            <td className="py-2.5 text-right">
                              <Link
                                href={`/analytics/llm-calls/${call.id}`}
                                className="text-xs text-gray-400 hover:text-blue-600"
                              >
                                Debug →
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">{total} total calls</p>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500">
                      Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}
                    </span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * limit >= total}
                      className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue:  'text-blue-600',
    green: 'text-green-600',
    red:   'text-red-600',
    amber: 'text-amber-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color] ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
