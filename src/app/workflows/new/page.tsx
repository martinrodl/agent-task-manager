'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { WORKFLOW_TEMPLATES, TEMPLATE_TAGS, type WorkflowTemplate } from '@/lib/workflow-templates'

type Mode = 'choose' | 'template' | 'blank'

function NewWorkflowForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') ?? ''

  const [mode, setMode]               = useState<Mode>('choose')
  const [selectedTemplate, setSelected] = useState<WorkflowTemplate | null>(null)
  const [activeTag, setActiveTag]     = useState<string>('all')
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  function pickTemplate(t: WorkflowTemplate) {
    setSelected(t)
    setName(t.name)
    setDescription(t.description)
    setMode('template')
  }

  function pickBlank() {
    setSelected(null)
    setName('')
    setDescription('')
    setMode('blank')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (selectedTemplate) {
      // Create from template
      const res = await fetch('/api/v1/workflows/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate.id, name, description, projectId: projectId || undefined }),
      })
      if (res.ok) {
        const wf = await res.json()
        router.push(`/workflows/${wf.id}`)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to create workflow')
        setLoading(false)
      }
    } else {
      // Create blank
      const res = await fetch('/api/v1/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, projectId: projectId || undefined }),
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
  }

  const filteredTemplates = activeTag === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.tags.includes(activeTag))

  // ── Choose mode ──────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-surface-0 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <Link href="/workflows" className="text-sm text-text-secondary hover:text-text-primary">← Workflows</Link>
            <h1 className="text-2xl font-bold text-text-primary mt-2">New workflow</h1>
            <p className="text-sm text-text-secondary mt-1">Start from a template or build from scratch.</p>
          </div>

          {/* Tag filter */}
          <div className="flex flex-wrap gap-2 mb-5">
            {(['all', ...TEMPLATE_TAGS] as string[]).map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  activeTag === tag
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-1 border border-border text-text-secondary hover:border-border'
                }`}
              >
                {tag === 'all' ? 'All templates' : tag}
              </button>
            ))}
          </div>

          {/* Templates grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {filteredTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => pickTemplate(t)}
                className="text-left bg-surface-1 border border-border rounded-xl p-5 hover:border-accent hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary group-hover:text-accent">{t.name}</p>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{t.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.tags.map(tag => (
                        <span key={tag} className="text-xs bg-surface-2 text-text-secondary px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-text-tertiary">
                      {t.states.length} states · {t.transitions.length} transitions
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Blank option */}
          <button
            onClick={pickBlank}
            className="w-full text-left bg-surface-1 border-2 border-dashed border-border rounded-xl p-5 hover:border-border-strong transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">➕</span>
              <div>
                <p className="font-semibold text-text-primary group-hover:text-text-primary">Start from scratch</p>
                <p className="text-xs text-text-tertiary mt-0.5">Define your own states and transitions.</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Template or blank form ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-0 p-8">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <button onClick={() => setMode('choose')} className="text-sm text-text-secondary hover:text-text-primary">← Back to templates</button>
          <h1 className="text-2xl font-bold text-text-primary mt-2">
            {selectedTemplate ? `${selectedTemplate.icon} ${selectedTemplate.name}` : 'New workflow'}
          </h1>
          {selectedTemplate && (
            <p className="text-sm text-text-secondary mt-1">{selectedTemplate.description}</p>
          )}
        </div>

        {selectedTemplate && (
          <div className="mb-4 bg-accent/[0.06] border border-accent/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-accent mb-2">This template includes:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {selectedTemplate.states.map(s => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-accent">{s.label}</span>
                  {s.isBlocking && <span className="text-xs text-warn">(HITL)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-surface-1 rounded-xl border border-border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Code Review Workflow"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-accent text-text-inverse text-sm font-medium rounded-lg hover:shadow-glow disabled:opacity-50 transition-colors"
            >
              {loading
                ? 'Creating…'
                : selectedTemplate
                  ? `Create from template`
                  : 'Create & configure states'
              }
            </button>
            <Link href="/workflows" className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewWorkflowPage() {
  return <Suspense><NewWorkflowForm /></Suspense>
}
