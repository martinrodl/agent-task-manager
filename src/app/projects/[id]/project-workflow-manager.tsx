'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface WorkflowOption { id: string; name: string }

export function ProjectWorkflowManager({
  projectId,
  unassignedWorkflows,
}: {
  projectId: string
  unassignedWorkflows: WorkflowOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function assign() {
    if (!selected) return
    setLoading(true)
    await fetch(`/api/v1/workflows/${selected}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1"
      >
        + Assign existing workflow to this project
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select a workflow…</option>
        {unassignedWorkflows.map(wf => (
          <option key={wf.id} value={wf.id}>{wf.name}</option>
        ))}
      </select>
      <button
        onClick={assign}
        disabled={!selected || loading}
        className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Assigning…' : 'Assign'}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </div>
  )
}
