'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

interface LlmCallDetail {
  id: string
  taskId: string
  agentName: string
  provider: string
  model: string
  systemPrompt: string
  userPrompt: string
  rawResponse: string | null
  success: boolean
  errorMessage: string | null
  promptTokens: number | null
  completionTokens: number | null
  latencyMs: number
  parseSuccess: boolean
  parsedTransition: string | null
  createdAt: string
  task: { id: string; title: string; workflowId: string } | null
  taskEvent: { id: string; actor: string; comment: string | null; createdAt: string; metadata: Record<string, unknown> } | null
}

export default function LlmCallDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [call, setCall]       = useState<LlmCallDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNF]     = useState(false)

  useEffect(() => {
    fetch(`/api/v1/analytics/llm-calls/${id}`)
      .then(r => {
        if (r.status === 404) { setNF(true); return null }
        return r.json()
      })
      .then(d => { if (d) setCall(d) })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-full">
        <Nav />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">Loading…</p>
        </main>
      </div>
    )
  }

  if (notFound || !call) {
    return (
      <div className="flex h-full">
        <Nav />
        <main className="flex-1 p-8">
          <p className="text-red-500">LLM call not found.</p>
          <Link href="/analytics" className="text-blue-600 hover:underline text-sm mt-2 block">← Back to Analytics</Link>
        </main>
      </div>
    )
  }

  const ok = call.success && call.parseSuccess
  const totalTokens = (call.promptTokens ?? 0) + (call.completionTokens ?? 0)

  return (
    <div className="flex h-full">
      <Nav />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">

          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/analytics" className="text-sm text-gray-400 hover:text-gray-600">
              ← Analytics
            </Link>
            <h1 className="text-xl font-bold text-gray-900 mt-2">LLM Call Debug</h1>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{call.id}</p>
          </div>

          {/* Status banner */}
          <div className={`rounded-xl p-4 mb-6 border ${
            ok
              ? 'bg-green-50 border-green-200'
              : !call.success
                ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge ok={call.success}      label="LLM call" />
              <StatusBadge ok={call.parseSuccess} label="JSON parse" />
              <span className="text-gray-600">
                Agent: <span className="font-mono font-medium">{call.agentName}</span>
              </span>
              <span className="text-gray-600">
                Model: <span className="font-mono font-medium">{call.provider}/{call.model}</span>
              </span>
              <span className="text-gray-600">
                Latency: <strong>{call.latencyMs}ms</strong>
              </span>
              {totalTokens > 0 && (
                <span className="text-gray-600">
                  Tokens: <strong>{call.promptTokens ?? '?'} in / {call.completionTokens ?? '?'} out</strong>
                </span>
              )}
              <span className="text-gray-400 text-xs">{formatDate(call.createdAt)}</span>
            </div>

            {call.errorMessage && (
              <div className="mt-3 bg-red-100 rounded-lg px-3 py-2">
                <p className="text-xs text-red-700 font-mono">{call.errorMessage}</p>
              </div>
            )}

            {call.parsedTransition && (
              <p className="text-sm text-gray-700 mt-2">
                Parsed transition: <span className="font-mono font-medium">{call.parsedTransition}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">

            {/* Left: prompts + response */}
            <div className="col-span-2 space-y-4">
              <PromptBlock label="System prompt" content={call.systemPrompt} />
              <PromptBlock label="User prompt"   content={call.userPrompt} />
              {call.rawResponse && (
                <PromptBlock label="Raw response" content={call.rawResponse} variant="output" />
              )}
            </div>

            {/* Right: sidebar */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-4">

                {call.task && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Task</p>
                    <Link href={`/tasks/${call.taskId}`} className="text-blue-600 hover:underline text-sm">
                      {call.task.title}
                    </Link>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-1">Recorded</p>
                  <p className="text-xs text-gray-700">{formatDate(call.createdAt)}</p>
                </div>

                {call.taskEvent && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Resulting transition</p>
                    {call.taskEvent.comment && (
                      <p className="text-xs text-gray-600 italic">"{call.taskEvent.comment.slice(0, 120)}"</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatDate(call.taskEvent.createdAt)}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-1">Token usage</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Input</span>
                      <span className="font-mono">{call.promptTokens?.toLocaleString() ?? '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Output</span>
                      <span className="font-mono">{call.completionTokens?.toLocaleString() ?? '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium border-t border-gray-100 pt-1 mt-1">
                      <span className="text-gray-700">Total</span>
                      <span className="font-mono">{totalTokens > 0 ? totalTokens.toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
      ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function PromptBlock({ label, content, variant = 'input' }: {
  label: string
  content: string
  variant?: 'input' | 'output'
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > 1200
  const displayed = isLong && !expanded ? content.slice(0, 1200) + '…' : content

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</h3>
        <span className="text-xs text-gray-300">{content.length} chars</span>
      </div>
      <pre className={`text-xs font-mono rounded-lg p-3 overflow-auto whitespace-pre-wrap ${
        variant === 'output' ? 'bg-green-50 text-gray-700' : 'bg-gray-50 text-gray-700'
      } ${isLong && !expanded ? 'max-h-64' : 'max-h-[600px]'}`}>
        {displayed}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          {expanded ? 'Show less' : `Show full (${content.length} chars)`}
        </button>
      )}
    </div>
  )
}
