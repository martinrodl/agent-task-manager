'use client'

import { useEffect, useState, useCallback } from 'react'
import { Nav } from '@/components/nav'
import { formatDate, priorityLabel, priorityColor } from '@/lib/utils'
import Link from 'next/link'
import { CheckCircle, ShieldAlert } from 'lucide-react'

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
    const es = new EventSource('/api/v1/stream/tasks')
    es.addEventListener('task_updated', () => load())
    es.onerror = () => {
      es.close()
      setTimeout(() => load(), 5_000)
    }
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
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="font-display text-xs font-semibold text-text-tertiary uppercase tracking-[0.2em] mb-1">HITL Checkpoints</p>
              <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Review queue</h1>
              <p className="text-sm text-text-secondary mt-0.5">Tasks waiting for human approval</p>
            </div>
            <span className="badge-warn">
              <ShieldAlert className="w-3 h-3" />
              {tasks.length} pending
            </span>
          </div>

          {loading ? (
            <p className="text-text-secondary">Loading…</p>
          ) : tasks.length === 0 ? (
            <div className="card p-12 text-center">
              <CheckCircle className="w-10 h-10 text-ok mx-auto mb-3" />
              <p className="font-display font-semibold text-text-primary">Queue is empty</p>
              <p className="text-sm text-text-secondary mt-1">No tasks waiting for review.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map(task => {
                const lastComment = task.events[0]?.comment
                const lastActor   = task.events[0]?.actor
                return (
                  <div key={task.id} className="card overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between p-5 pb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[10px] font-display font-medium px-2 py-0.5 rounded-full uppercase tracking-wider"
                            style={{ backgroundColor: task.state.color + '20', color: task.state.color }}
                          >
                            {task.state.label}
                          </span>
                          <span className="text-xs text-text-tertiary">{task.workflow.name}</span>
                          <span className={`text-xs font-medium ${priorityColor(task.priority)}`}>{priorityLabel(task.priority)}</span>
                        </div>
                        <Link href={`/tasks/${task.id}`} className="font-semibold text-text-primary hover:text-accent block truncate transition-colors">{task.title}</Link>
                        {task.description && <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">{task.description}</p>}
                      </div>
                      <span className="text-xs text-text-tertiary shrink-0 ml-4">{formatDate(task.updatedAt)}</span>
                    </div>

                    {/* Agent's submission comment */}
                    {lastComment && (
                      <div className="mx-5 mb-3 p-3 bg-accent/[0.06] rounded-lg border border-accent/20">
                        <p className="text-[10px] text-accent font-display font-medium mb-0.5 uppercase tracking-wider">Agent note ({lastActor})</p>
                        <p className="text-sm text-text-primary">{lastComment}</p>
                      </div>
                    )}

                    {/* Result */}
                    {task.result && (
                      <div className="mx-5 mb-3 p-3 bg-surface-2 rounded-lg border border-border">
                        <p className="text-[10px] text-text-tertiary font-display font-medium mb-1 uppercase tracking-wider">Agent result</p>
                        <pre className="text-xs font-mono text-text-secondary overflow-auto max-h-32">{JSON.stringify(task.result, null, 2)}</pre>
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
                          className="input-field mb-2 text-sm resize-none"
                        />
                      )}

                      {error[task.id] && <p className="text-xs text-err mb-2">{error[task.id]}</p>}

                      <div className="flex flex-wrap gap-2">
                        {task.humanTransitions.map(t => {
                          const isApprove = t.toState.name !== 'CHANGES_REQUIRED' && !t.requiresComment
                          return (
                            <button
                              key={t.name}
                              onClick={() => doTransition(task.id, t)}
                              disabled={pending === `${task.id}:${t.name}`}
                              className={`px-3 py-1.5 text-sm font-display font-medium rounded-lg transition-all duration-200 disabled:opacity-50 ${
                                isApprove
                                  ? 'bg-ok text-text-inverse shadow-sm hover:shadow-md active:scale-[0.98]'
                                  : 'bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
                              }`}
                            >
                              {pending === `${task.id}:${t.name}` ? 'Processing…' : t.label}
                              <span className="ml-1 text-xs opacity-70">→ {t.toState.label}</span>
                            </button>
                          )
                        })}
                        <Link href={`/tasks/${task.id}`} className="px-3 py-1.5 text-sm text-text-tertiary hover:text-accent transition-colors">
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
