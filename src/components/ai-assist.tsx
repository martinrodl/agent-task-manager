'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchJSON } from '@/lib/fetch'

interface AiProvider { id: string; name: string; model: string; provider: string; apiKey: string | null }

// ─── Result types ──────────────────────────────────────────────────────────────

export interface SkillResult {
  name: string; icon: string; description: string; content: string
}

export interface WorkflowState {
  name: string; label: string; color: string
  isInitial: boolean; isTerminal: boolean; isBlocking: boolean; sortOrder: number
}
export interface WorkflowTransitionProposal {
  name: string; label: string
  fromStateName: string; toStateName: string
  allowedRoles: string[]; requiresComment: boolean
}
export interface WorkflowResult {
  name: string; description: string
  states: WorkflowState[]
  transitions: WorkflowTransitionProposal[]
}

export interface AgentResult {
  name: string; description: string
  provider: string; model: string
  systemPrompt: string
  maxTokens: number; temperature: number
}

export interface TaskResult {
  title: string; description: string
  priority: number   // 0-3
  context: Record<string, unknown>
}

// ─── Type map ─────────────────────────────────────────────────────────────────

type ResultMap = {
  skill:    SkillResult
  workflow: WorkflowResult
  agent:    AgentResult
  task:     TaskResult
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props<T extends keyof ResultMap> {
  type: T
  onResult: (result: ResultMap[T]) => void
  label?: string
  defaultProviderId?: string
}

const TITLES: Record<string, string> = {
  skill:    'Skill Generator',
  workflow: 'Workflow Generator',
  agent:    'Agent Generator',
  task:     'Task Generator',
}

const PLACEHOLDERS: Record<string, string> = {
  skill:    'e.g. "Skill for searching GitHub issues and summarizing them"',
  workflow: 'e.g. "Code review workflow with agent analysis and human approval gate"',
  agent:    'e.g. "An agent that reviews pull requests and suggests improvements"',
  task:     'e.g. "Implement dark mode toggle for the settings page"',
}

export function AiAssistButton<T extends keyof ResultMap>({ type, onResult, label, defaultProviderId }: Props<T>) {
  const [open, setOpen]             = useState(false)
  const [prompt, setPrompt]         = useState('')
  const [providers, setProviders]   = useState<AiProvider[]>([])
  const [providerId, setProviderId] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    fetchJSON<(AiProvider & { enabled?: boolean; isDefault?: boolean })[]>('/api/v1/settings/ai-providers', []).then(d => {
      const list: AiProvider[] = Array.isArray(d) ? d.filter(p => p.enabled !== false) : []
      setProviders(list)
      // Prefer: explicitly passed defaultProviderId > isDefault > first in list
      const preferred = defaultProviderId
        ? list.find(p => p.id === defaultProviderId)
        : (d as (AiProvider & { isDefault?: boolean })[]).find(p => p.isDefault)
      const sel = preferred ?? list[0]
      if (sel) setProviderId(sel.id)
    })
  }, [open, defaultProviderId])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function generate() {
    if (!prompt.trim()) { setError('Describe what you want to generate'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/v1/ai/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, prompt: prompt.trim(), providerId: providerId || undefined }),
    })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error ?? 'Generation failed')
      setLoading(false)
      return
    }
    onResult(d.result as ResultMap[T])
    setOpen(false)
    setPrompt('')
    setLoading(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setError('') }}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-warn bg-warn-dim border border-warn/20 rounded-lg hover:bg-warn-dim transition-colors"
        title="Generate with AI"
      >
        <span>✨</span>
        <span>{label ?? 'Fill with AI'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[420px] bg-surface-1 border border-border rounded-xl shadow-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <p className="font-semibold text-text-primary">AI {TITLES[type]}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-text-tertiary hover:text-text-secondary text-xl leading-none">×</button>
          </div>

          {providers.length === 0 ? (
            <div className="text-sm text-warn bg-warn-dim rounded-lg p-3">
              No AI providers configured. <a href="/settings" className="underline font-medium">Go to Settings →</a>
            </div>
          ) : (
            <>
              {(() => {
                const sel = providers.find(p => p.id === providerId)
                const needsKey = sel && ['anthropic','openai','azure','openrouter'].includes(sel.provider)
                if (needsKey && !sel.apiKey) return (
                  <div className="text-sm text-warn bg-warn-dim border border-warn/20 rounded-lg p-3">
                    <strong>{sel.name}</strong> has no API key stored.{' '}
                    <a href="/settings" className="underline font-medium">Go to Settings → AI Providers</a> and re-enter the key.
                  </div>
                )
                return null
              })()}
              {providers.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">AI Provider</label>
                  <select
                    value={providerId}
                    onChange={e => setProviderId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warn"
                  >
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.model})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Describe what you want</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
                  placeholder={PLACEHOLDERS[type]}
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-warn"
                />
              </div>

              {error && <p className="text-xs text-err">{error}</p>}

              <div className="flex items-center justify-between">
                <p className="text-xs text-text-tertiary">Ctrl+Enter to generate</p>
                <button
                  onClick={generate}
                  disabled={loading || !prompt.trim() || (() => {
                    const sel = providers.find(p => p.id === providerId)
                    return !!(sel && ['anthropic','openai','azure','openrouter'].includes(sel.provider) && !sel.apiKey)
                  })()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-warn text-text-inverse text-sm font-medium rounded-lg hover:shadow-md disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <><span className="animate-spin inline-block">⟳</span><span>Generating…</span></>
                  ) : (
                    <><span>✨</span><span>Generate</span></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
