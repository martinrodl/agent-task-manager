'use client'

import { useEffect, useState, useCallback } from 'react'
import { Nav } from '@/components/nav'
import { formatDate, priorityLabel, priorityColor } from '@/lib/utils'
import Link from 'next/link'

interface HumanTransition { id: string; name: string; label: string; requiresComment: boolean; toState: { name: string; label: string; color: string } }
interface TaskItem {
  id: string; title: string; description?: string; priority: number; updatedAt: string
  state: { id: string; name: string; label: string; color: string }
  workflow: { id: string; name: string }
  result?: Record<string, unknown>
  context: Record<string, unknown>
  events: { comment?: string; actor: string }[]
  humanTransitions: HumanTransition[]
}

export default function ReviewPage() {
  const [tasks, setTasks]         = useState<TaskItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [comment, setComment]     = useState<Record<string, string>>({})
  const [pending, setPending]     = useState<string | null>(null)
  const [error, setError]         = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/review/queue')
    if (res.ok) {
      const data = await res.json()
      setTasks(data.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // SSE for live updates
    const es = new EventSource('/api/v1/stream/tasks')
    es.addEventListener('task_updated', () => load())
    return () => es.close()
  }, [load])

  async function doTransition(taskId: string, t: HumanTransition) {
    const c = comment[taskId] ?? ''
    if (t.requiresComment && !c.trim()) {
      setError(prev => ({ ...prev, [taskId]: 'Comment is required.' }))
      return
    }
    setPending(`${taskId}:${t.name}`)
    setError(prev => ({ ...prev, [taskId]: '' }))

    const res = await fetch(`/api/v1/tasks/${taskId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionName: t.name, comment: c || undefined }),
    })

    if (res.ok) {
      await load()
      setComment(prev => ({ ...prev, [taskId]: '' }))
    } else {
      const data = await res.json().catch(() => ({}))
      setError(prev => ({ ...prev, [taskId]: data.message ?? 'Failed' }))
    }
    setPending(null)
  }

  return (
    <div className="flex h-full">
      <Nav reviewCount={tasks.length} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Review queue</h1>
              <p className="text-sm text-gray-500 mt-0.5">Tasks waiting for human approval (HITL checkpoints)</p>
            </div>
            <span className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
              {tasks.length} pending
            </span>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : tasks.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium text-gray-900">Queue is empty</p>
              <p className="text-sm text-gray-500 mt-1">No tasks waiting for review.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map(task => {
                const lastComment = task.events[0]?.comment
                const lastActor   = task.events[0]?.actor
                return (
                  <div key={task.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between p-5 pb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: task.state.color + '20', color: task.state.color }}>
                            {task.state.label}
                          </span>
                          <span className="text-xs text-gray-400">{task.workflow.name}</span>
                          <span className={`text-xs font-medium ${priorityColor(task.priority)}`}>{priorityLabel(task.priority)}</span>
                        </div>
                        <Link href={`/tasks/${task.id}`} className="font-semibold text-gray-900 hover:underline block truncate">{task.title}</Link>
                        {task.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-4">Waiting {formatDate(task.updatedAt)}</span>
                    </div>

                    {/* Agent's submission comment */}
                    {lastComment && (
                      <div className="mx-5 mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-600 font-medium mb-0.5">Agent note ({lastActor})</p>
                        <p className="text-sm text-blue-800">{lastComment}</p>
                      </div>
                    )}

                    {/* Result */}
                    {task.result && (
                      <div className="mx-5 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-500 font-medium mb-1">Agent result</p>
                        <pre className="text-xs font-mono text-gray-700 overflow-auto max-h-32">{JSON.stringify(task.result, null, 2)}</pre>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="px-5 pb-5">
                      {task.humanTransitions.some(t => t.requiresComment) && (
                        <textarea
                          value={comment[task.id] ?? ''}
                          onChange={e => setComment(prev => ({ ...prev, [task.id]: e.target.value }))}
                          placeholder="Comment…"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                        />
                      )}

                      {error[task.id] && <p className="text-xs text-red-600 mb-2">{error[task.id]}</p>}

                      <div className="flex flex-wrap gap-2">
                        {task.humanTransitions.map(t => {
                          const isApprove = t.toState.name !== 'CHANGES_REQUIRED' && !t.requiresComment
                          return (
                            <button
                              key={t.name}
                              onClick={() => doTransition(task.id, t)}
                              disabled={pending === `${task.id}:${t.name}`}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                                isApprove
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {pending === `${task.id}:${t.name}` ? 'Processing…' : t.label}
                              <span className="ml-1 text-xs opacity-70">→ {t.toState.label}</span>
                            </button>
                          )
                        })}
                        <Link href={`/tasks/${task.id}`} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-transparent">
                          View details →
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
