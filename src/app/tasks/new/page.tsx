'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { fetchJSON } from '@/lib/fetch'
import { AiAssistButton, type TaskResult } from '@/components/ai-assist'
import { ArrowLeft } from 'lucide-react'

interface Workflow { id: string; name: string }

const PRIORITY_LABELS = ['Low', 'Medium', 'High', 'Critical']

function NewTaskForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const parentId = searchParams.get('parentId') ?? ''
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [workflowId, setWorkflowId] = useState(searchParams.get('workflowId') ?? '')
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [priority, setPriority]     = useState('0')
  const [context, setContext]       = useState('{}')
  const [contextError, setContextError] = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    fetchJSON<Workflow[]>('/api/v1/workflows', []).then(data => setWorkflows(Array.isArray(data) ? data : []))
  }, [])

  function validateContext(v: string) {
    try { JSON.parse(v); setContextError(''); return true }
    catch { setContextError('Invalid JSON'); return false }
  }

  function applyAiResult(r: TaskResult) {
    if (r.title)       setTitle(r.title)
    if (r.description) setDescription(r.description)
    if (r.priority !== undefined) setPriority(String(Math.min(3, Math.max(0, r.priority))))
    if (r.context && typeof r.context === 'object') {
      const json = JSON.stringify(r.context, null, 2)
      setContext(json)
      validateContext(json)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateContext(context)) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        title,
        description: description || undefined,
        assignedTo:  assignedTo  || undefined,
        priority:    Number(priority),
        context:     JSON.parse(context),
        parentId:    parentId    || undefined,
      }),
    })

    if (res.ok) {
      const task = await res.json()
      router.push(`/tasks/${task.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create task')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link href={parentId ? `/tasks/${parentId}` : '/tasks'} className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              {parentId ? 'Parent task' : 'Tasks'}
            </Link>
            <h1 className="font-display text-2xl font-bold text-text-primary mt-2 tracking-tight">
              {parentId ? 'New subtask' : 'New task'}
            </h1>
            {parentId && (
              <p className="text-xs text-text-tertiary mt-0.5 font-mono">parent: {parentId.slice(-8)}</p>
            )}
          </div>
          <div className="mt-7">
            <AiAssistButton type="task" onResult={applyAiResult} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="section-title mb-1.5 block">Workflow <span className="text-err">*</span></label>
            <select
              value={workflowId}
              onChange={e => setWorkflowId(e.target.value)}
              className="input-field"
              required
            >
              <option value="">Select workflow…</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="section-title mb-1.5 block">Title <span className="text-err">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Implement OAuth login"
              className="input-field"
              required autoFocus
            />
          </div>

          <div>
            <label className="section-title mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="section-title mb-1.5 block">Assign to agent</label>
              <input
                type="text"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="agent-id or leave blank"
                className="input-field"
              />
            </div>
            <div>
              <label className="section-title mb-1.5 block">
                Priority
                {priority !== '0' && (
                  <span className={`ml-2 text-xs font-normal normal-case tracking-normal ${
                    priority === '3' ? 'text-err' : priority === '2' ? 'text-warn' : 'text-accent'
                  }`}>
                    {PRIORITY_LABELS[Number(priority)]}
                  </span>
                )}
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="input-field"
              >
                <option value="0">Low</option>
                <option value="1">Medium</option>
                <option value="2">High</option>
                <option value="3">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="section-title mb-1.5 block">
              Context <span className="font-normal normal-case tracking-normal text-text-tertiary">(JSON metadata for agent)</span>
            </label>
            <textarea
              value={context}
              onChange={e => { setContext(e.target.value); validateContext(e.target.value) }}
              rows={4}
              className={`input-field resize-none font-mono text-xs ${contextError ? 'border-err focus:border-err focus:ring-err/30' : ''}`}
            />
            {contextError && <p className="text-xs text-err mt-1">{contextError}</p>}
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-accent text-text-inverse text-sm font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
            >
              {loading ? 'Creating…' : 'Create task'}
            </button>
            <Link href="/tasks" className="px-4 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewTaskPage() {
  return <Suspense><NewTaskForm /></Suspense>
}
