'use client'

import { useEffect, useState, useRef } from 'react'
import { Nav } from '@/components/nav'
import { PROVIDERS } from '@/lib/providers'
import { fetchJSON } from '@/lib/fetch'
import { AiAssistButton, type AgentResult } from '@/components/ai-assist'

interface AiProviderOption { id: string; name: string; model: string; provider: string }
interface Agent {
  id: string; name: string; description?: string
  aiProviderId?: string
  aiProvider?: AiProviderOption | null
  provider: string; baseUrl?: string; apiKey?: string; model?: string
  systemPrompt?: string; maxTokens: number; temperature: number
  extraConfig: Record<string, unknown>; enabled: boolean
  createdAt: string
}
interface Skill  { id: string; name: string; icon: string; description?: string }
interface EnvVar { id: string; key: string; description?: string }

const EMPTY = {
  name: '', description: '',
  aiProviderId: '',           // preferred: link to a Settings AI provider
  // manual fallback fields (only used when aiProviderId is empty)
  provider: 'openai', baseUrl: '', apiKey: '', model: '',
  systemPrompt: '', maxTokens: 2048, temperature: 0.7,
  extraConfig: {} as Record<string, unknown>, enabled: true,
  skillIds: [] as string[],
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [aiProviders, setAiProviders] = useState<AiProviderOption[]>([])
  const [showManual, setShowManual] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillDropOpen, setSkillDropOpen] = useState(false)
  const skillRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY })
  const [editing, setEditing] = useState<string | null>(null)  // agent id or 'new'
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [error, setError] = useState('')

  // Skills + EnvVars catalog
  const [allSkills, setAllSkills]   = useState<Skill[]>([])
  const [allEnvVars, setAllEnvVars] = useState<EnvVar[]>([])

  // Per-agent assignments (loaded lazily when expanded)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [agentSkills, setAgentSkills]   = useState<Record<string, string[]>>({})  // agentId → skillIds
  const [agentEnvVars, setAgentEnvVars] = useState<Record<string, string[]>>({})  // agentId → envVarIds
  const [assigning, setAssigning]   = useState(false)

  async function load() {
    const [ag, bt, sk, ev, pv] = await Promise.all([
      fetchJSON<Agent[]>('/api/v1/agents', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
      fetchJSON<Skill[]>('/api/v1/skills', []),
      fetchJSON<EnvVar[]>('/api/v1/envvars', []),
      fetchJSON<(AiProviderOption & { enabled?: boolean })[]>('/api/v1/settings/ai-providers', []),
    ])
    setAgents(Array.isArray(ag) ? ag : [])
    setReviewCount(bt.total ?? 0)
    setAllSkills(Array.isArray(sk) ? sk : [])
    setAllEnvVars(Array.isArray(ev) ? ev : [])
    setAiProviders(Array.isArray(pv) ? pv.filter(p => p.enabled !== false) : [])
  }

  useEffect(() => { load() }, [])

  async function expandAgent(agentId: string) {
    if (expanded === agentId) { setExpanded(null); return }
    setExpanded(agentId)
    if (agentSkills[agentId] !== undefined) return  // already loaded
    const [sk, ev] = await Promise.all([
      fetchJSON<Skill[]>(`/api/v1/agents/${agentId}/skills`, []),
      fetchJSON<EnvVar[]>(`/api/v1/agents/${agentId}/envvars`, []),
    ])
    setAgentSkills(prev => ({ ...prev, [agentId]: (sk as Skill[]).map(s => s.id) }))
    setAgentEnvVars(prev => ({ ...prev, [agentId]: (ev as EnvVar[]).map(e => e.id) }))
  }

  function toggleSkill(agentId: string, skillId: string) {
    setAgentSkills(prev => {
      const cur = prev[agentId] ?? []
      return { ...prev, [agentId]: cur.includes(skillId) ? cur.filter(id => id !== skillId) : [...cur, skillId] }
    })
  }

  function toggleEnvVar(agentId: string, envVarId: string) {
    setAgentEnvVars(prev => {
      const cur = prev[agentId] ?? []
      return { ...prev, [agentId]: cur.includes(envVarId) ? cur.filter(id => id !== envVarId) : [...cur, envVarId] }
    })
  }

  async function saveAssignments(agentId: string) {
    setAssigning(true)
    await Promise.all([
      fetch(`/api/v1/agents/${agentId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillIds: agentSkills[agentId] ?? [] }),
      }),
      fetch(`/api/v1/agents/${agentId}/envvars`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVarIds: agentEnvVars[agentId] ?? [] }),
      }),
    ])
    setAssigning(false)
  }

  function openNew() {
    // Pre-select default AI provider if available
    const defProv = aiProviders.find(p => (p as AiProviderOption & { isDefault?: boolean }).isDefault) ?? aiProviders[0]
    setForm({ ...EMPTY, aiProviderId: defProv?.id ?? '' })
    setShowManual(false)
    setSkillSearch('')
    setSkillDropOpen(false)
    setEditing('new')
    setError('')
    setTimeout(() => document.getElementById('agent-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function openEdit(a: Agent) {
    // Load existing skills for this agent if not already loaded
    let skillIds: string[] = agentSkills[a.id] ?? []
    if (agentSkills[a.id] === undefined) {
      const sk = await fetchJSON<Skill[]>(`/api/v1/agents/${a.id}/skills`, [])
      skillIds = (sk as Skill[]).map(s => s.id)
      setAgentSkills(prev => ({ ...prev, [a.id]: skillIds }))
    }
    setForm({
      name: a.name, description: a.description ?? '',
      aiProviderId: a.aiProviderId ?? '',
      provider: a.provider, baseUrl: a.baseUrl ?? '',
      apiKey: '', model: a.model ?? '',
      systemPrompt: a.systemPrompt ?? '',
      maxTokens: a.maxTokens, temperature: a.temperature,
      extraConfig: a.extraConfig, enabled: a.enabled,
      skillIds,
    })
    setShowManual(!a.aiProviderId)
    setSkillSearch('')
    setSkillDropOpen(false)
    setEditing(a.id)
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    const isNew = editing === 'new'
    const url   = isNew ? '/api/v1/agents' : `/api/v1/agents/${editing}`
    const method = isNew ? 'POST' : 'PATCH'

    const { skillIds: _skillIds, ...formData } = form
    const body = {
      ...formData,
      apiKey:       formData.apiKey       || null,
      description:  formData.description  || null,
      systemPrompt: formData.systemPrompt || null,
      extraConfig:  formData.extraConfig,
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const saved = await res.json()
      // Save skills assignment
      await fetch(`/api/v1/agents/${saved.id}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillIds: form.skillIds }),
      })
      setAgentSkills(prev => ({ ...prev, [saved.id]: form.skillIds }))
      await load()
      setEditing(null)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Save failed')
    }
    setSaving(false)
  }

  async function deleteAgent(id: string) {
    if (!confirm('Delete this agent?')) return
    await fetch(`/api/v1/agents/${id}`, { method: 'DELETE' })
    await load()
  }

  async function testAgent(id: string) {
    setTesting(id)
    setTestResult(prev => ({ ...prev, [id]: { ok: false, msg: 'Testing…' } }))
    const res = await fetch(`/api/v1/agents/${id}`, { method: 'POST' })
    const d = await res.json()
    setTestResult(prev => ({
      ...prev,
      [id]: { ok: d.ok, msg: d.ok ? `OK: ${d.response}` : `Error: ${d.error}` },
    }))
    setTesting(null)
  }

  const providerMeta = (p: string) => PROVIDERS.find(x => x.value === p)

  return (
    <div className="flex h-full">
      <Nav reviewCount={reviewCount} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Agents</h1>
              <p className="text-sm text-gray-500 mt-0.5">Configure LLM backends that auto-process tasks.</p>
            </div>
            <button
              onClick={openNew}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New agent
            </button>
          </div>

          {/* Form */}
          {editing && (
            <div id="agent-form" className="bg-white border-2 border-blue-200 rounded-xl p-6 mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{editing === 'new' ? 'New agent' : 'Edit agent'}</h2>
                <AiAssistButton
                  type="agent"
                  defaultProviderId={form.aiProviderId || undefined}
                  onResult={(r: AgentResult) => {
                    setForm(f => ({
                      ...f,
                      ...(r.name        ? { name: r.name }               : {}),
                      ...(r.description ? { description: r.description } : {}),
                      ...(r.systemPrompt ? { systemPrompt: r.systemPrompt } : {}),
                      ...(r.maxTokens   ? { maxTokens: r.maxTokens }     : {}),
                      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
                    }))
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="my-code-agent"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Must match the Agent ID set on workflow states.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Handles code review tasks"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* AI Model selection */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <label className="block text-xs font-medium text-gray-600">AI Model <span className="text-red-500">*</span></label>
                {aiProviders.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No AI providers configured. <a href="/settings" className="underline font-medium">Go to Settings →</a>
                  </p>
                ) : (
                  <select
                    value={form.aiProviderId}
                    onChange={e => setForm(f => ({ ...f, aiProviderId: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Custom (manual) —</option>
                    {aiProviders.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.model}</option>
                    ))}
                  </select>
                )}
                {form.aiProviderId ? (
                  <p className="text-xs text-gray-400">API key and endpoint are managed in <a href="/settings" className="text-blue-600 hover:underline">Settings → AI Providers</a>.</p>
                ) : (
                  <button type="button" onClick={() => setShowManual(v => !v)} className="text-xs text-blue-600 hover:underline">
                    {showManual ? '▲ Hide manual fields' : '▼ Show manual fields'}
                  </button>
                )}
              </div>

              {/* Manual fields — shown when no aiProviderId selected */}
              {!form.aiProviderId && showManual && (
                <div className="space-y-4 border border-dashed border-gray-300 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                      <select
                        value={form.provider}
                        onChange={e => {
                          const meta = PROVIDERS.find(p => p.value === e.target.value)
                          setForm(f => ({ ...f, provider: e.target.value, baseUrl: meta?.urlPlaceholder ?? f.baseUrl }))
                        }}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Base URL</label>
                      <input
                        value={form.baseUrl}
                        onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                        placeholder={providerMeta(form.provider)?.urlPlaceholder ?? 'https://...'}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Model <span className="text-red-500">*</span></label>
                      <input
                        value={form.model}
                        onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="gpt-4o-mini"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                      <input
                        type="password"
                        value={form.apiKey}
                        onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                        placeholder="sk-..."
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {form.provider === 'azure' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Version</label>
                      <input
                        value={(form.extraConfig.apiVersion as string) ?? ''}
                        onChange={e => setForm(f => ({ ...f, extraConfig: { ...f.extraConfig, apiVersion: e.target.value } }))}
                        placeholder="2024-02-01"
                        className="w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Params */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max tokens</label>
                  <input
                    type="number"
                    value={form.maxTokens}
                    onChange={e => setForm(f => ({ ...f, maxTokens: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Temperature</label>
                  <input
                    type="number"
                    step="0.1" min="0" max="2"
                    value={form.temperature}
                    onChange={e => setForm(f => ({ ...f, temperature: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
                    />
                    Enabled (auto-invoke)
                  </label>
                </div>
              </div>

              {/* System prompt */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">System prompt</label>
                <textarea
                  value={form.systemPrompt}
                  onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  rows={4}
                  placeholder="You are an expert software engineer. Complete tasks methodically..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Skills autocomplete multi-select */}
              <div ref={skillRef}>
                <label className="block text-xs font-medium text-gray-600 mb-1">🔧 Skills</label>
                {allSkills.length === 0 ? (
                  <p className="text-xs text-gray-400">No skills defined yet. <a href="/skills" className="text-blue-600 hover:underline">Create skills →</a></p>
                ) : (
                  <div className="relative">
                    {/* Selected tags + input */}
                    <div
                      className="min-h-[36px] flex flex-wrap gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
                      onClick={() => { setSkillDropOpen(true); (skillRef.current?.querySelector('input') as HTMLInputElement | null)?.focus() }}
                    >
                      {form.skillIds.map(id => {
                        const s = allSkills.find(x => x.id === id)
                        if (!s) return null
                        return (
                          <span key={id} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-md">
                            <span>{s.icon}</span>
                            <span>{s.name}</span>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, skillIds: f.skillIds.filter(i => i !== id) })) }}
                              className="ml-0.5 text-blue-500 hover:text-blue-800 leading-none"
                            >×</button>
                          </span>
                        )
                      })}
                      <input
                        type="text"
                        value={skillSearch}
                        onChange={e => { setSkillSearch(e.target.value); setSkillDropOpen(true) }}
                        onFocus={() => setSkillDropOpen(true)}
                        onBlur={() => setTimeout(() => setSkillDropOpen(false), 150)}
                        placeholder={form.skillIds.length === 0 ? 'Search and add skills…' : ''}
                        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent placeholder-gray-400"
                      />
                    </div>

                    {/* Dropdown */}
                    {skillDropOpen && (() => {
                      const q = skillSearch.toLowerCase()
                      const options = allSkills.filter(s =>
                        !form.skillIds.includes(s.id) &&
                        (s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
                      )
                      if (options.length === 0) return null
                      return (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {options.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setForm(f => ({ ...f, skillIds: [...f.skillIds, s.id] }))
                                setSkillSearch('')
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-blue-50 transition-colors"
                            >
                              <span className="text-base">{s.icon}</span>
                              <div>
                                <span className="font-medium text-gray-900">{s.name}</span>
                                {s.description && <span className="ml-2 text-gray-400 text-xs">{s.description}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save agent'}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Agent list */}
          {agents.length === 0 && !editing ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-2xl mb-2">🤖</p>
              <p className="text-gray-500 mb-1">No agents configured yet.</p>
              <p className="text-sm text-gray-400">Create an agent to enable automatic task processing.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(a => {
                const meta = providerMeta(a.provider)
                const tr = testResult[a.id]
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${a.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 font-mono">{a.name}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{meta?.label ?? a.provider}</span>
                            {!a.enabled && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">disabled</span>}
                          </div>
                          {a.description && <p className="text-sm text-gray-500 mt-0.5">{a.description}</p>}
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                            {a.aiProvider ? (
                              <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                                {a.aiProvider.name} · {a.aiProvider.model}
                              </span>
                            ) : (
                              <>
                                <span className="font-mono truncate max-w-[160px]">{a.baseUrl}</span>
                                <span>·</span>
                                <span className="font-mono">{a.model}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>temp {a.temperature}</span>
                            <span>·</span>
                            <span>{a.maxTokens} tok</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <button
                          onClick={() => expandAgent(a.id)}
                          className={`px-3 py-1.5 text-xs border rounded-lg transition-colors
                            ${expanded === a.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        >
                          Skills & Keys {expanded === a.id ? '▲' : '▼'}
                        </button>
                        <button
                          onClick={() => testAgent(a.id)}
                          disabled={testing === a.id}
                          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          {testing === a.id ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          onClick={() => openEdit(a)}
                          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAgent(a.id)}
                          className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {tr && (
                      <div className={`mt-2 text-xs px-3 py-2 rounded-lg font-mono ${tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {tr.msg}
                      </div>
                    )}

                    {/* Skills & EnvVars assignment panel */}
                    {expanded === a.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                        {/* Skills */}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">🔧 Skills</p>
                          {allSkills.length === 0 ? (
                            <p className="text-xs text-gray-400">No skills defined yet. <a href="/skills" className="text-blue-600 hover:underline">Create skills →</a></p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {allSkills.map(s => {
                                const active = (agentSkills[a.id] ?? []).includes(s.id)
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => toggleSkill(a.id, s.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors
                                      ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                                  >
                                    <span>{s.icon}</span>
                                    <span>{s.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Env vars */}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">🔑 API Keys & Env Vars</p>
                          {allEnvVars.length === 0 ? (
                            <p className="text-xs text-gray-400">No keys defined yet. <a href="/skills" className="text-blue-600 hover:underline">Add keys →</a></p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {allEnvVars.map(v => {
                                const active = (agentEnvVars[a.id] ?? []).includes(v.id)
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => toggleEnvVar(a.id, v.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border font-mono transition-colors
                                      ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'}`}
                                  >
                                    🔑 {v.key}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => saveAssignments(a.id)}
                          disabled={assigning}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {assigning ? 'Saving…' : 'Save assignments'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* How it works */}
          <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-5 text-sm text-gray-600 space-y-2">
            <p className="font-semibold text-gray-900">How auto-invocation works</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Set the <strong>Agent ID</strong> on a workflow state (gear icon on kanban column) to match an agent's <strong>Name</strong>.</li>
              <li>When a task transitions into that state, the system automatically calls the configured LLM.</li>
              <li>The LLM receives the task title, description, context, and available transitions.</li>
              <li>It replies with JSON: <code className="bg-gray-100 px-1 rounded">{"{ transitionName, comment, result }"}</code></li>
              <li>The system executes the transition and stores the result.</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  )
}
