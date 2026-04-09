'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewWorkflowPage() {
  const router = useRouter()
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })

    if (res.ok) {
      const wf = await res.json()
      router.push(`/workflows/${wf.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create workflow')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <Link href="/workflows" className="text-sm text-gray-500 hover:text-gray-700">← Workflows</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">New workflow</h1>
          <p className="text-sm text-gray-500 mt-1">After creating, you can define states and transitions.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Code Review Workflow"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating…' : 'Create & configure states'}
            </button>
            <Link href="/workflows" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
