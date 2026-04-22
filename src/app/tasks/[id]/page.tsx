'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { formatDate, priorityLabel, priorityColor } from '@/lib/utils'
import { ArrowLeft, ArrowRight, Bot, ExternalLink, GitBranch, Cpu } from 'lucide-react'

interface State  { id: string; name: string; label: string; color: string; isBlocking: boolean; isTerminal: boolean; agentId?: string | null }
interface Transition { name: string; label: string; toState: string; toStateLabel: string; requiresComment: boolean; href: string }
interface Event  { id: string; fromState?: State; toState?: State; actor: string; actorType: string; comment?: string; createdAt: string }
interface Subtask { id: string; title: string; state: State; priority: number }
interface Task   {
  id: string; title: string; description?: string; state: State
  workflow: { id: string; name: string }
  context: Record<string, unknown>; result?: Record<string, unknown>
  assignedTo?: string; createdBy: string; priority: number
  parentId?: string | null
  createdAt: string; updatedAt: string
  events: Event[]
  subtasks: Subtask[]
  _links: { availableTransitions: Transition[] }
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [task, setTask]           = useState<Task | null>(null)
  const [loading, setLoading]     = useState(true)
  const [processing, setProcessing] = useState(false)
  const [transitioning, setTrans] = useState<string | null>(null)
  const [comment, setComment]     = useState('')
  const [activeTransition, setActiveTransition] = useState<Transition | null>(null)
  const [error, setError]         = useState('')
  const [newComment, setNewComment]   = useState('')
  const [postingComment, setPosting]  = useState(false)
  const [commentError, setCommentError] = useState('')
  const [invoking, setInvoking]       = useState(false)
  const [invokeMsg, setInvokeMsg]     = useState('')

  async function loadTask() {
    const res = await fetch(`/api/v1/tasks/${id}`)
    if (res.ok) setTask(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    loadTask()
    const es = new EventSource(`/api/v1/stream/tasks`)
    es.addEventListener('task_processing', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.taskId === id) setProcessing(true)
      } catch { /* ignore */ }
    })
    es.addEventListener('task_transitioned', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.taskId === id) { setProcessing(false); loadTask() }
      } catch { /* ignore */ }
    })
    es.addEventListener('task_updated', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.taskId === id) { setProcessing(false); loadTask() }
      } catch { /* ignore */ }
    })
    es.onerror = () => {
      es.close()
      setTimeout(() => loadTask(), 5_000)
    }
    return () => es.close()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function invokeAgent() {
    setInvoking(true)
    setInvokeMsg('')
    const res = await fetch(`/api/v1/tasks/${id}/process`, { method: 'POST' })
    const d = await res.json()
    setInvokeMsg(res.ok ? `Agent "${d.agentName}" invoked — waiting for result…` : (d.error ?? 'Failed'))
    setInvoking(false)
    if (res.ok) setTimeout(loadTask, 3000)
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPosting(true)
    setCommentError('')
    const res = await fetch(`/api/v1/tasks/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newComment }),
    })
    if (res.ok) {
      setNewComment('')
      await loadTask()
    } else {
      const d = await res.json().catch(() => ({}))
      setCommentError(d.error ?? 'Failed to post comment')
    }
    setPosting(false)
  }

  async function doTransition(t: Transition) {
    if (t.requiresComment && !comment.trim()) {
      setError('Comment is required for this transition.')
      return
    }
    setTrans(t.name)
    setError('')

    const res = await fetch(`/api/v1/tasks/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionName: t.name, comment: comment || undefined }),
    })

    if (res.ok) {
      setTask(await res.json())
      setComment('')
      setActiveTransition(null)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? 'Transition failed')
    }
    setTrans(null)
  }

  if (loading) return <div className="p-8 text-text-secondary">Loading…</div>
  if (!task)   return <div className="p-8 text-err">Task not found.</div>

  const transitions = task._links?.availableTransitions ?? []

  const URL_KEYS = ['previewUrl', 'preview_url', 'deployUrl', 'deploy_url', 'url',
                    'sandboxUrl', 'sandbox_url', 'appUrl', 'app_url', 'prUrl', 'pr_url']
  const previewLinks: { label: string; url: string }[] = []
  if (task.result) {
    for (const [k, v] of Object.entries(task.result)) {
      if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        if (URL_KEYS.includes(k) || k.toLowerCase().includes('url') || k.toLowerCase().includes('link')) {
          const label = k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()
          previewLinks.push({ label, url: v })
        }
      }
    }
    for (const v of Object.values(task.result)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (typeof v2 === 'string' && URL_KEYS.includes(k2) && (v2.startsWith('http://') || v2.startsWith('https://'))) {
            previewLinks.push({ label: k2.replace(/_/g, ' '), url: v2 })
          }
        }
      }
    }
  }
  const branch = typeof task.result?.branch === 'string' ? task.result.branch as string : null

  return (
    <div className="min-h-screen bg-surface-0">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tasks
          </Link>
          <div className="flex items-start justify-between mt-2">
            <h1 className="font-display text-2xl font-bold text-text-primary flex-1 mr-4 tracking-tight">{task.title}</h1>
            <span className="text-[10px] font-mono bg-surface-2 text-text-tertiary px-2 py-1 rounded-lg border border-border shrink-0">{task.id}</span>
          </div>
        </div>

        {/* Preview / deploy URL banner */}
        {previewLinks.length > 0 && (
          <div className="mb-4 bg-ok/[0.08] border border-ok/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="w-4 h-4 text-ok" />
              <p className="text-sm font-display font-semibold text-ok uppercase tracking-wider">Deployed — ready for review</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {previewLinks.map(({ label, url }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ok text-text-inverse text-sm font-display font-medium rounded-lg hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="capitalize">{label}</span>
                </a>
              ))}
              {branch && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ok/10 text-ok text-sm rounded-lg font-mono border border-ok/20">
                  <GitBranch className="w-3 h-3" /> {branch}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Main content */}
          <div className="col-span-2 space-y-4">
            {task.description && (
              <div className="card p-5">
                <h3 className="section-title mb-2">Description</h3>
                <p className="text-text-primary whitespace-pre-wrap text-sm">{task.description}</p>
              </div>
            )}

            <div className="card p-5">
              <h3 className="section-title mb-2">Context <span className="text-text-tertiary font-normal normal-case tracking-normal">(agent metadata)</span></h3>
              <pre className="text-xs font-mono bg-surface-2 text-text-secondary p-3 rounded-lg overflow-auto border border-border">
                {JSON.stringify(task.context, null, 2)}
              </pre>
            </div>

            {task.result && (
              <div className="card p-5">
                <h3 className="section-title mb-2">Result <span className="text-text-tertiary font-normal normal-case tracking-normal">(agent output)</span></h3>
                <pre className="text-xs font-mono bg-ok/[0.06] text-text-secondary p-3 rounded-lg overflow-auto border border-ok/10">
                  {JSON.stringify(
                    { ...task.result, screenshots: task.result.screenshots ? `[${(task.result.screenshots as string[]).length} screenshot(s)]` : undefined },
                    null, 2
                  )}
                </pre>
              </div>
            )}

            {Array.isArray(task.result?.screenshots) && (task.result.screenshots as string[]).length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">
                  Screenshots <span className="text-text-tertiary">({(task.result.screenshots as string[]).length})</span>
                </h3>
                <div className="space-y-3">
                  {(task.result.screenshots as string[]).map((b64, i) => (
                    <div key={i} className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-surface-2 px-3 py-1 text-[10px] text-text-tertiary border-b border-border font-display uppercase tracking-wider">
                        Screenshot {i + 1}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/png;base64,${b64}`} alt={`Screenshot ${i + 1}`} className="w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title">
                  Subtasks {task.subtasks.length > 0 && <span className="text-text-tertiary">({task.subtasks.length})</span>}
                </h3>
                <Link
                  href={`/tasks/new?workflowId=${task.workflow.id}&parentId=${task.id}`}
                  className="text-xs text-accent hover:underline font-display font-medium"
                >
                  + Add subtask
                </Link>
              </div>
              {task.subtasks.length === 0 ? (
                <p className="text-xs text-text-tertiary">No subtasks yet.</p>
              ) : (
                <div className="space-y-1">
                  {task.subtasks.map(s => (
                    <Link
                      key={s.id}
                      href={`/tasks/${s.id}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-2 transition-colors group"
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.state.color }} />
                      <span className="text-sm text-text-primary group-hover:text-accent flex-1 truncate transition-colors">{s.title}</span>
                      <span className="text-xs text-text-tertiary shrink-0">{s.state.label}</span>
                      {s.state.isTerminal && <span className="text-xs text-ok">✓</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {transitions.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">Actions (human)</h3>
                <div className="space-y-3">
                  {transitions.map(t => (
                    <div key={t.name}>
                      {activeTransition?.name === t.name ? (
                        <div className="space-y-2">
                          {t.requiresComment && (
                            <textarea
                              value={comment}
                              onChange={e => setComment(e.target.value)}
                              placeholder="Comment (required)…"
                              rows={2}
                              className="input-field text-sm resize-none"
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => doTransition(t)}
                              disabled={!!transitioning}
                              className="px-3 py-1.5 bg-accent text-text-inverse text-sm font-display font-medium rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
                            >
                              {transitioning === t.name ? 'Processing…' : `Confirm: ${t.label}`}
                            </button>
                            <button
                              onClick={() => { setActiveTransition(null); setComment(''); setError('') }}
                              className="px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setActiveTransition(t); setError('') }}
                          className="px-3 py-1.5 border border-border text-sm text-text-secondary rounded-lg hover:bg-surface-2 hover:border-border-strong transition-all"
                        >
                          {t.label} → <span className="text-text-tertiary">{t.toStateLabel}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {error && <p className="text-sm text-err mt-2">{error}</p>}
              </div>
            )}

            {/* Activity */}
            <div className="card p-5">
              <h3 className="section-title mb-3">Activity</h3>
              {task.events.length === 0 ? (
                <p className="text-sm text-text-tertiary">No events yet.</p>
              ) : (
                <div className="space-y-0">
                  {task.events.map((e, i) => {
                    const isComment = !e.fromState && !e.toState && !!e.comment
                    return (
                      <div key={e.id} className="relative flex gap-3 py-2.5">
                        {i < task.events.length - 1 && (
                          <div className="absolute left-[5px] top-8 bottom-0 w-px bg-border" />
                        )}
                        <div className={`mt-1.5 w-[11px] h-[11px] rounded-full shrink-0 border-2 border-surface-1 ${isComment ? 'bg-text-tertiary' : 'bg-accent'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary">
                            <span className="font-medium">{e.actor}</span>
                            <span className="text-text-tertiary"> ({e.actorType})</span>
                            {e.fromState && e.toState && (
                              <span className="text-text-secondary"> · {e.fromState.label} <ArrowRight className="w-3 h-3 inline" /> <span style={{ color: e.toState.color }}>{e.toState.label}</span></span>
                            )}
                            {!e.fromState && e.toState && (
                              <span className="text-text-secondary"> · created in <span style={{ color: e.toState.color }}>{e.toState.label}</span></span>
                            )}
                          </p>
                          {e.comment && (
                            <p className={`text-sm mt-1 ${isComment ? 'text-text-primary bg-surface-2 rounded-lg px-3 py-2 border border-border' : 'text-text-secondary italic'}`}>
                              {isComment ? e.comment : `"${e.comment}"`}
                            </p>
                          )}
                          <p className="text-[11px] text-text-tertiary mt-0.5">{formatDate(e.createdAt)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment() }}
                  placeholder="Add a comment… (Ctrl+Enter to submit)"
                  rows={2}
                  className="input-field text-sm resize-none"
                />
                {commentError && <p className="text-xs text-err mt-1">{commentError}</p>}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={postComment}
                    disabled={postingComment || !newComment.trim()}
                    className="px-3 py-1.5 bg-accent text-text-inverse text-xs font-display font-medium rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-40 transition-all"
                  >
                    {postingComment ? 'Posting…' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div>
                <p className="section-title mb-0.5">State</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.state.color }} />
                  <span className="text-sm font-medium text-text-primary">{task.state.label}</span>
                  {task.state.isBlocking && <span className="badge-warn text-[10px] py-0">HITL</span>}
                  {task.state.isTerminal && <span className="badge-neutral text-[10px] py-0">done</span>}
                </div>
              </div>

              <div>
                <p className="section-title mb-0.5">Workflow</p>
                <Link href={`/workflows/${task.workflow.id}`} className="text-sm text-accent hover:underline">{task.workflow.name}</Link>
              </div>

              <div>
                <p className="section-title mb-0.5">Priority</p>
                <p className={`text-sm font-medium ${priorityColor(task.priority)}`}>{priorityLabel(task.priority)}</p>
              </div>

              {task.assignedTo && (
                <div>
                  <p className="section-title mb-0.5">Assigned to</p>
                  <p className="text-sm font-mono text-text-primary">{task.assignedTo}</p>
                </div>
              )}

              <div>
                <p className="section-title mb-0.5">Created by</p>
                <p className="text-sm text-text-primary">{task.createdBy}</p>
              </div>

              <div>
                <p className="section-title mb-0.5">Created</p>
                <p className="text-xs text-text-secondary">{formatDate(task.createdAt)}</p>
              </div>

              <div>
                <p className="section-title mb-0.5">Updated</p>
                <p className="text-xs text-text-secondary">{formatDate(task.updatedAt)}</p>
              </div>
            </div>

            {processing && (
              <div className="card p-4 space-y-2 animate-pulse-glow border-accent/30">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent animate-pulse" />
                  <p className="text-xs font-display font-semibold text-accent uppercase tracking-wider">Agent is working…</p>
                </div>
                <p className="text-xs text-text-secondary">Page will refresh automatically when done.</p>
              </div>
            )}

            {task.state.agentId && !task.state.isTerminal && (
              <div className="card p-4 space-y-2 border-accent/20">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-accent" />
                  <p className="text-xs font-display font-semibold text-text-primary uppercase tracking-wider">Agent assigned</p>
                </div>
                <p className="text-xs text-accent font-mono">{task.state.agentId}</p>
                <button
                  onClick={async () => { setProcessing(true); await invokeAgent() }}
                  disabled={invoking || processing}
                  className="w-full px-3 py-1.5 bg-accent text-text-inverse text-xs font-display font-medium rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
                >
                  {invoking || processing ? 'Processing…' : 'Process now'}
                </button>
                {invokeMsg && (
                  <p className={`text-xs ${invokeMsg.includes('invoked') ? 'text-accent' : 'text-err'}`}>
                    {invokeMsg}
                  </p>
                )}
              </div>
            )}

            <div className="bg-surface-1 rounded-xl p-4 text-xs text-text-tertiary font-mono space-y-2 border border-border">
              <p className="section-title font-sans">Agent API</p>
              <p className="text-accent">GET /api/v1/tasks/{task.id}</p>
              <p className="text-accent">POST /api/v1/tasks/{task.id}/transition</p>
              <pre className="text-text-tertiary bg-surface-2 p-2 rounded text-[11px] overflow-auto border border-border">{JSON.stringify({ transitionName: transitions[0]?.name ?? 'transition_name', comment: 'optional' }, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
