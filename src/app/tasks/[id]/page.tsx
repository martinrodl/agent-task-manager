'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { formatDate, priorityLabel, priorityColor } from '@/lib/utils'

interface State  { id: string; name: string; label: string; color: string; isBlocking: boolean; isTerminal: boolean; agentId?: string | null }
interface Transition { name: string; label: string; toState: string; toStateLabel: string; requiresComment: boolean; href: string }
interface Event  { id: string; fromState?: State; toState?: State; actor: string; actorType: string; comment?: string; createdAt: string }
interface Task   {
  id: string; title: string; description?: string; state: State
  workflow: { id: string; name: string }
  context: Record<string, unknown>; result?: Record<string, unknown>
  assignedTo?: string; createdBy: string; priority: number
  createdAt: string; updatedAt: string
  events: Event[]
  _links: { availableTransitions: Transition[] }
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [task, setTask]           = useState<Task | null>(null)
  const [loading, setLoading]     = useState(true)
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

  useEffect(() => { loadTask() }, [id])

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

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>
  if (!task)   return <div className="p-8 text-red-500">Task not found.</div>

  const transitions = task._links?.availableTransitions ?? []

  // Detect URLs in task.result for preview banner
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
    // Also pick up nested { previewUrl } one level deep
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-700">← Tasks</Link>
          <div className="flex items-start justify-between mt-2">
            <h1 className="text-2xl font-bold text-gray-900 flex-1 mr-4">{task.title}</h1>
            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded shrink-0">{task.id}</span>
          </div>
        </div>

        {/* Preview / deploy URL banner */}
        {previewLinks.length > 0 && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-600">🚀</span>
              <p className="text-sm font-semibold text-emerald-800">Deployed — ready for review</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {previewLinks.map(({ label, url }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <span>↗</span>
                  <span className="capitalize">{label}</span>
                </a>
              ))}
              {branch && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-sm rounded-lg font-mono border border-emerald-200">
                  🌿 {branch}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Main content */}
          <div className="col-span-2 space-y-4">
            {task.description && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                <p className="text-gray-800 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Context */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Context <span className="text-xs text-gray-400">(agent metadata)</span></h3>
              <pre className="text-sm font-mono bg-gray-50 p-3 rounded-lg overflow-auto text-gray-700">
                {JSON.stringify(task.context, null, 2)}
              </pre>
            </div>

            {/* Result */}
            {task.result && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Result <span className="text-xs text-gray-400">(agent output)</span></h3>
                <pre className="text-sm font-mono bg-green-50 p-3 rounded-lg overflow-auto text-gray-700">
                  {JSON.stringify(task.result, null, 2)}
                </pre>
              </div>
            )}

            {/* Transitions */}
            {transitions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Actions (human)</h3>
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => doTransition(t)}
                              disabled={!!transitioning}
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              {transitioning === t.name ? 'Processing…' : `Confirm: ${t.label}`}
                            </button>
                            <button
                              onClick={() => { setActiveTransition(null); setComment(''); setError('') }}
                              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setActiveTransition(t); setError('') }}
                          className="px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          {t.label} → <span className="text-gray-500">{t.toStateLabel}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
              </div>
            )}

            {/* Event history + comments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Activity</h3>
              {task.events.length === 0 ? (
                <p className="text-sm text-gray-400">No events yet.</p>
              ) : (
                <div className="space-y-3">
                  {task.events.map(e => {
                    const isComment = !e.fromState && !e.toState && !!e.comment
                    return (
                      <div key={e.id} className="flex gap-3">
                        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isComment ? 'bg-gray-300' : 'bg-blue-300'}`} />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">
                            <span className="font-medium">{e.actor}</span>
                            <span className="text-gray-400"> ({e.actorType})</span>
                            {e.fromState && e.toState && (
                              <span> · {e.fromState.label} <span className="text-gray-400">→</span> <span style={{ color: e.toState.color }}>{e.toState.label}</span></span>
                            )}
                            {!e.fromState && e.toState && (
                              <span> · created in <span style={{ color: e.toState.color }}>{e.toState.label}</span></span>
                            )}
                          </p>
                          {e.comment && (
                            <p className={`text-sm mt-0.5 ${isComment ? 'text-gray-800 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100' : 'text-gray-600 italic'}`}>
                              {isComment ? e.comment : `"${e.comment}"`}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(e.createdAt)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add comment */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment() }}
                  placeholder="Add a comment… (Ctrl+Enter to submit)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {commentError && <p className="text-xs text-red-500 mt-1">{commentError}</p>}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={postComment}
                    disabled={postingComment || !newComment.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {postingComment ? 'Posting…' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500">State</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.state.color }} />
                  <span className="text-sm font-medium">{task.state.label}</span>
                  {task.state.isBlocking && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded">HITL</span>}
                  {task.state.isTerminal && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded">done</span>}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500">Workflow</p>
                <Link href={`/workflows/${task.workflow.id}`} className="text-sm text-blue-600 hover:underline">{task.workflow.name}</Link>
              </div>

              <div>
                <p className="text-xs text-gray-500">Priority</p>
                <p className={`text-sm font-medium ${priorityColor(task.priority)}`}>{priorityLabel(task.priority)}</p>
              </div>

              {task.assignedTo && (
                <div>
                  <p className="text-xs text-gray-500">Assigned to</p>
                  <p className="text-sm font-mono">{task.assignedTo}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500">Created by</p>
                <p className="text-sm">{task.createdBy}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-xs text-gray-700">{formatDate(task.createdAt)}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Updated</p>
                <p className="text-xs text-gray-700">{formatDate(task.updatedAt)}</p>
              </div>
            </div>

            {/* Process now — shown when current state has an agent */}
            {task.state.agentId && !task.state.isTerminal && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">🤖</span>
                  <p className="text-xs font-semibold text-blue-800">Agent assigned</p>
                </div>
                <p className="text-xs text-blue-700 font-mono">{task.state.agentId}</p>
                <button
                  onClick={invokeAgent}
                  disabled={invoking}
                  className="w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {invoking ? 'Invoking…' : 'Process now'}
                </button>
                {invokeMsg && (
                  <p className={`text-xs ${invokeMsg.includes('invoked') ? 'text-blue-700' : 'text-red-600'}`}>
                    {invokeMsg}
                  </p>
                )}
              </div>
            )}

            {/* API hint for agents */}
            <div className="bg-gray-900 rounded-xl p-4 text-xs text-gray-300 font-mono space-y-2">
              <p className="text-gray-500 font-sans font-medium text-xs">Agent API</p>
              <p>GET /api/v1/tasks/{task.id}</p>
              <p>POST /api/v1/tasks/{task.id}/transition</p>
              <pre className="text-gray-400 bg-gray-800 p-2 rounded text-xs overflow-auto">{JSON.stringify({ transitionName: transitions[0]?.name ?? 'transition_name', comment: 'optional' }, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
