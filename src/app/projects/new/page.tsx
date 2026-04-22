'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PRESET_COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#10B981',
  '#F59E0B', '#EF4444', '#F97316', '#EC4899',
]

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName]         = useState('')
  const [slug, setSlug]         = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [color, setColor]       = useState('#3B82F6')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  function handleNameChange(v: string) {
    setName(v)
    if (!slugEdited) setSlug(slugify(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, description: description || undefined, color }),
    })

    if (res.ok) {
      const project = await res.json()
      router.push(`/projects/${project.id}`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create project')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 p-8">
      <div className="max-w-md mx-auto">
        <Link href="/projects" className="text-sm text-text-secondary hover:text-text-primary">← Projects</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-2 mb-6">New project</h1>

        <form onSubmit={handleSubmit} className="bg-surface-1 rounded-xl border border-border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name *</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Backend API"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              required autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Slug <span className="font-normal text-text-tertiary">(namespace key)</span> *
            </label>
            <div className="flex items-center border border-border rounded-lg focus-within:ring-2 focus-within:ring-accent">
              <span className="pl-3 text-text-tertiary text-sm select-none">/</span>
              <input
                value={slug}
                onChange={e => { setSlug(slugify(e.target.value)); setSlugEdited(true) }}
                placeholder="backend-api"
                className="flex-1 px-2 py-2 text-sm font-mono bg-transparent focus:outline-none"
                required
              />
            </div>
            <p className="text-xs text-text-tertiary mt-0.5">Lowercase letters, numbers, hyphens. Used in MCP filters.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. All workflows for the backend microservices"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-border scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-3 bg-surface-0 rounded-lg">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: color }}
            >
              {name ? name.slice(0, 2).toUpperCase() : '??'}
            </div>
            <div>
              <p className="font-semibold text-sm text-text-primary">{name || 'Project name'}</p>
              <p className="text-xs text-text-tertiary font-mono">/{slug || 'slug'}</p>
            </div>
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-accent text-text-inverse text-sm font-medium rounded-lg hover:shadow-glow disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating…' : 'Create project'}
            </button>
            <Link href="/projects" className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
