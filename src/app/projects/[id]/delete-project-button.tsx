'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await fetch(`/api/v1/projects/${projectId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/projects')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Failed to delete (${res.status})`)
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-err">Delete "{projectName}" and all its workflows?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 bg-err text-white text-xs font-display font-semibold rounded-lg hover:bg-err/90 disabled:opacity-50 transition-all"
        >
          {deleting ? 'Deleting...' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-err">{error}</span>}
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-err border border-err/30 rounded-lg hover:bg-err/10 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  )
}
