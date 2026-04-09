'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/nav'
import { PROVIDERS } from '@/lib/providers'
import { fetchJSON } from '@/lib/fetch'

interface AiProvider {
  id: string; name: string; provider: string; baseUrl?: string
  apiKey?: string; model: string; isDefault: boolean; enabled: boolean
}

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  anthropic:    ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai:       ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  azure:        ['gpt-4o', 'gpt-4-turbo'],
  openrouter:   ['anthropic/claude-opus-4-6', 'openai/gpt-4o', 'meta-llama/llama-3.1-70b-instruct'],
  ollama:       ['llama3.1', 'mistral', 'codellama', 'phi3'],
  lmstudio:     ['local-model'],
  webui:        ['local-model'],
  'claude-code': ['claude-opus-4-6', 'claude-sonnet-4-6', 'default'],
  custom:       [],
}

const EMPTY = { name: '', provider: 'anthropic', baseUrl: '', apiKey: '', model: 'claude-opus-4-6', isDefault: false, enabled: true }

export default function SettingsPage() {
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [form, setForm] = useState({ ...EMPTY })
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})

  async function load() {
    const [pv, bt] = await Promise.all([
      fetchJSON<AiProvider[]>('/api/v1/settings/ai-providers', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
    ])
    setProviders(Array.isArray(pv) ? pv : [])
    setReviewCount(bt.total ?? 0)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm({ ...EMPTY })
    setEditing('new')
    setError('')
  }

  function openEdit(p: AiProvider) {
    setForm({ name: p.name, provider: p.provider, baseUrl: p.baseUrl ?? '', apiKey: '', model: p.model, isDefault: p.isDefault, enabled: p.enabled })
    setEditing(p.id)
    setError('')
  }

  async function save() {
    if (!form.name || !form.model) { setError('Name and model are required'); return }
    setSaving(true); setError('')
    const isNew = editing === 'new'
    const res = await fetch(
      isNew ? '/api/v1/settings/ai-providers' : `/api/v1/settings/ai-providers/${editing}`,
      { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }
    )
    if (res.ok) { await load(); setEditing(null) }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Save failed') }
    setSaving(false)
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this AI provider?')) return
    await fetch(`/api/v1/settings/ai-providers/${id}`, { method: 'DELETE' })
    await load()
  }

  async function testProvider(p: AiProvider) {
    setTesting(p.id)
    setTestResult(prev => ({ ...prev, [p.id]: { ok: false, msg: 'Testing connection…' } }))
    const res = await fetch('/api/v1/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: p.id }),
    })
    const d = await res.json().catch(() => ({}))
    setTestResult(prev => ({
      ...prev,
      [p.id]: d.ok
        ? { ok: true,  msg: `✓ Connected — ${p.model} responded in ${d.latency}ms` }
        : { ok: false, msg: d.error ?? 'Connection failed' },
    }))
    setTesting(null)
  }

  const providerLabel = (v: string) => PROVIDERS.find(p => p.value === v)?.label ?? v
  const suggestions   = MODEL_SUGGESTIONS[form.provider] ?? []

  return (
    <div className="flex h-full">
      <Nav reviewCount={reviewCount} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
          <p className="text-sm text-gray-500 mb-8">Global configuration for the AgentTask platform.</p>

          {/* AI Providers section */}
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">✨ AI Providers</h2>
              <p className="text-sm text-gray-500 mt-0.5">Used by the AI assistant buttons in Workflow Builder and Skills editor.</p>
            </div>
            <button onClick={openNew} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              + Add provider
            </button>
          </div>

          {/* Form */}
          {editing && (
            <div className="bg-white border-2 border-blue-200 rounded-xl p-5 mt-4 mb-4 space-y-4">
              <h3 className="font-semibold text-gray-900">{editing === 'new' ? 'New AI provider' : 'Edit provider'}</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Display name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Anthropic Claude"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                  <select value={form.provider}
                    onChange={e => {
                      const p = PROVIDERS.find(p => p.value === e.target.value)
                      setForm(f => ({ ...f, provider: e.target.value, baseUrl: p?.urlPlaceholder ?? '', model: MODEL_SUGGESTIONS[e.target.value]?.[0] ?? '' }))
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Model <span className="text-red-500">*</span>
                  </label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="claude-opus-4-6"
                    list="model-suggestions"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <datalist id="model-suggestions">
                    {suggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setForm(f => ({ ...f, model: s }))}
                          className={`text-xs px-1.5 py-0.5 rounded border transition-colors
                            ${form.model === s ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    API Key {PROVIDERS.find(p => p.value === form.provider)?.needsKey && <span className="text-red-500">*</span>}
                  </label>
                  <input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder={editing !== 'new' ? '(unchanged)' : 'sk-ant-... / sk-... / ghp_...'}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {form.provider !== 'anthropic' && form.provider !== 'openai' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {form.provider === 'claude-code' ? 'Path to claude binary' : 'Base URL'}
                  </label>
                  <input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    placeholder={PROVIDERS.find(p => p.value === form.provider)?.urlPlaceholder ?? ''}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {form.provider === 'claude-code' && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Leave blank to use <code>claude</code> from PATH. The agent will run in the workflow&apos;s workspace directory.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  Set as default
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                  Enabled
                </label>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              </div>
            </div>
          )}

          {/* Provider list */}
          <div className="mt-4 space-y-3">
            {providers.length === 0 && !editing ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <p className="text-3xl mb-2">✨</p>
                <p className="text-gray-500 mb-1">No AI providers configured.</p>
                <p className="text-sm text-gray-400">Add an Anthropic, OpenAI, or other provider to enable AI assistance in the app.</p>
              </div>
            ) : providers.map(p => {
              const tr = testResult[p.id]
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{p.name}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{providerLabel(p.provider)}</span>
                          {p.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">default</span>}
                          {!p.enabled && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">disabled</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{p.model}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => testProvider(p)} disabled={testing === p.id}
                        className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                        {testing === p.id ? 'Testing…' : 'Test'}
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">Edit</button>
                      <button onClick={() => deleteProvider(p.id)}
                        className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">Delete</button>
                    </div>
                  </div>
                  {tr && (
                    <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {tr.msg}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
