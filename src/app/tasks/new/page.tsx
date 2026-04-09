'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { fetchJSON } from '@/lib/fetch'

interface Workflow { id: string; name: string }

function NewTaskForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-700">← Tasks</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">New task</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workflow *</label>
            <select
              value={workflowId}
              onChange={e => setWorkflowId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select workflow…</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Implement OAuth login"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to agent</label>
              <input
                type="text"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="agent-id or leave blank"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">Low</option>
                <option value="1">Medium</option>
                <option value="2">High</option>
                <option value="3">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Context <span className="font-normal text-gray-400">(JSON metadata for agent)</span>
            </label>
            <textarea
              value={context}
              onChange={e => { setContext(e.target.value); validateContext(e.target.value) }}
              rows={4}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm ${contextError ? 'border-red-400' : 'border-gray-300'}`}
            />
            {contextError && <p className="text-xs text-red-500 mt-1">{contextError}</p>}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating…' : 'Create task'}
            </button>
            <Link href="/tasks" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewTaskPage() {
  return <Suspense><NewTaskForm /></Suspense>
}
