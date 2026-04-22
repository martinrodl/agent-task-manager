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
        className="text-sm text-text-secondary hover:text-accent flex items-center gap-1"
      >
        + Assign existing workflow to this project
      </button>
    )
  }

  return (
    <div className="card p-4 flex items-center gap-3">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="input-field flex-1"
      >
        <option value="">Select a workflow…</option>
        {unassignedWorkflows.map(wf => (
          <option key={wf.id} value={wf.id}>{wf.name}</option>
        ))}
      </select>
      <button
        onClick={assign}
        disabled={!selected || loading}
        className="px-3 py-2 bg-accent text-text-inverse text-sm font-display font-medium rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
      >
        {loading ? 'Assigning…' : 'Assign'}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-text-tertiary hover:text-text-primary transition-colors">
        Cancel
      </button>
    </div>
  )
}
