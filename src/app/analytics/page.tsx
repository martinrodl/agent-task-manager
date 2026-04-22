'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/nav'
import { formatDate, timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'

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
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [clearConfirm, setClearConfirm] = useState(false)
  const [deleting, setDeleting]     = useState(false)
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

  function reloadAll() {
    setSelected(new Set())
    setClearConfirm(false)
    setLS(true)
    fetch('/api/v1/analytics/summary')
      .then(r => r.json())
      .then(setSummary)
      .finally(() => setLS(false))
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
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setDeleting(true)
    await fetch('/api/v1/analytics/llm-calls', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    setDeleting(false)
    reloadAll()
  }

  async function clearAllLogs() {
    setDeleting(true)
    await fetch('/api/v1/analytics/llm-calls', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteAll: true }) })
    setDeleting(false)
    reloadAll()
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === calls.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(calls.map(c => c.id)))
    }
  }

  const ov = summary?.overview

  return (
    <div className="flex h-full">
      <Nav />
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="max-w-6xl mx-auto p-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
            {summary && (
              <p className="text-sm text-text-secondary mt-1">
                LLM call metrics — last 7 days (since {formatDate(summary.period.since)})
              </p>
            )}
          </div>

          {/* Overview cards */}
          {loadingSummary ? (
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface-1 rounded-xl border border-border p-5 h-24 animate-pulse bg-surface-0" />
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
            <div className="bg-surface-1 rounded-xl border border-border p-5 mb-6">
              <h2 className="font-semibold text-text-primary mb-4">Performance by agent</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-tertiary border-b border-border">
                      <th className="text-left pb-2 font-medium">Agent</th>
                      <th className="text-right pb-2 font-medium">Calls</th>
                      <th className="text-right pb-2 font-medium">Avg latency</th>
                      <th className="text-right pb-2 font-medium">Avg input tok</th>
                      <th className="text-right pb-2 font-medium">Avg output tok</th>
                      <th className="text-right pb-2 font-medium">Total tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.byAgent.map(row => (
                      <tr key={row.agentName} className="hover:bg-surface-2">
                        <td className="py-2.5 font-mono text-text-primary text-xs">{row.agentName}</td>
                        <td className="py-2.5 text-right text-text-primary">{row.totalCalls}</td>
                        <td className="py-2.5 text-right text-text-primary">
                          {row.avgLatencyMs != null ? `${row.avgLatencyMs}ms` : '—'}
                        </td>
                        <td className="py-2.5 text-right text-text-secondary">
                          {row.avgPromptTokens ?? '—'}
                        </td>
                        <td className="py-2.5 text-right text-text-secondary">
                          {row.avgCompletionTokens ?? '—'}
                        </td>
                        <td className="py-2.5 text-right text-text-primary tabular-nums">
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
            <div className="bg-surface-1 rounded-xl border border-border p-5 mb-6">
              <h2 className="font-semibold text-text-primary mb-4">Daily trend</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-tertiary border-b border-border">
                      <th className="text-left pb-2 font-medium">Day</th>
                      <th className="text-right pb-2 font-medium">Calls</th>
                      <th className="text-right pb-2 font-medium">Success rate</th>
                      <th className="text-right pb-2 font-medium">Avg latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.dailyTrend.map(row => (
                      <tr key={row.day} className="hover:bg-surface-2">
                        <td className="py-2 text-text-primary tabular-nums">{row.day}</td>
                        <td className="py-2 text-right text-text-primary">{row.calls}</td>
                        <td className="py-2 text-right">
                          <span className={`text-xs font-medium ${row.successRate >= 90 ? 'text-ok' : row.successRate >= 70 ? 'text-warn' : 'text-err'}`}>
                            {row.successRate}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-text-secondary">{row.avgLatency}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LLM call log */}
          <div className="bg-surface-1 rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text-primary">LLM call log</h2>
              <div className="flex items-center gap-3">
                {selected.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-err border border-err/30 rounded-lg hover:bg-err/10 disabled:opacity-50 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete {selected.size} selected
                  </button>
                )}
                {!clearConfirm ? (
                  <button
                    onClick={() => setClearConfirm(true)}
                    disabled={total === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary border border-border rounded-lg hover:border-err/30 hover:text-err disabled:opacity-40 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear all
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-err">Delete all {total} logs?</span>
                    <button
                      onClick={clearAllLogs}
                      disabled={deleting}
                      className="px-2.5 py-1 bg-err text-white text-xs font-semibold rounded-lg hover:bg-err/90 disabled:opacity-50 transition-all"
                    >
                      {deleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setClearConfirm(false)}
                      className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <input
                  value={agentFilter}
                  onChange={e => { setAgent(e.target.value); setPage(0) }}
                  placeholder="Filter by agent…"
                  className="px-3 py-1.5 border border-border rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
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
              <p className="text-sm text-text-tertiary py-4">Loading…</p>
            ) : calls.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-text-tertiary text-sm">No LLM calls recorded yet.</p>
                <p className="text-text-tertiary text-xs mt-1">Calls will appear here after agents run.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-text-tertiary border-b border-border">
                        <th className="pb-2 w-8">
                          <input
                            type="checkbox"
                            checked={calls.length > 0 && selected.size === calls.length}
                            onChange={toggleAll}
                            className="rounded"
                          />
                        </th>
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
                    <tbody className="divide-y divide-border">
                      {calls.map(call => {
                        const totalTok = (call.promptTokens ?? 0) + (call.completionTokens ?? 0)
                        const ok = call.success && call.parseSuccess
                        return (
                          <tr key={call.id} className={`hover:bg-surface-2 ${selected.has(call.id) ? 'bg-accent/[0.04]' : ''}`}>
                            <td className="py-2.5 w-8">
                              <input
                                type="checkbox"
                                checked={selected.has(call.id)}
                                onChange={() => toggleSelect(call.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="py-2.5 max-w-[180px]">
                              <Link href={`/tasks/${call.taskId}`} className="text-accent hover:underline truncate block text-xs">
                                {call.task?.title ?? call.taskId.slice(0, 8) + '…'}
                              </Link>
                            </td>
                            <td className="py-2.5 font-mono text-text-primary text-xs">{call.agentName}</td>
                            <td className="py-2.5 text-text-secondary text-xs">{call.model}</td>
                            <td className="py-2.5 text-right tabular-nums text-xs">{call.latencyMs}ms</td>
                            <td className="py-2.5 text-right tabular-nums text-text-secondary text-xs">
                              {totalTok > 0 ? totalTok.toLocaleString() : '—'}
                            </td>
                            <td className="py-2.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                ok
                                  ? 'bg-ok/[0.06] text-ok'
                                  : !call.success
                                    ? 'bg-err-dim text-err'
                                    : 'bg-warn-dim text-warn'
                              }`}>
                                {ok ? 'ok' : !call.success ? 'error' : 'parse-fail'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-xs text-text-tertiary whitespace-nowrap">
                              {timeAgo(call.createdAt)}
                            </td>
                            <td className="py-2.5 text-right">
                              <Link
                                href={`/analytics/llm-calls/${call.id}`}
                                className="text-xs text-text-tertiary hover:text-accent"
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
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-text-tertiary">{total} total calls</p>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-2 py-1 text-xs border border-border rounded disabled:opacity-40 hover:bg-surface-2"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-text-secondary">
                      Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}
                    </span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * limit >= total}
                      className="px-2 py-1 text-xs border border-border rounded disabled:opacity-40 hover:bg-surface-2"
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
    blue:  'text-accent',
    green: 'text-ok',
    red:   'text-err',
    amber: 'text-warn',
  }
  return (
    <div className="bg-surface-1 rounded-xl border border-border p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color] ?? 'text-text-primary'}`}>{value}</p>
    </div>
  )
}
