'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/nav'
import { PROVIDERS } from '@/lib/providers'
import { fetchJSON } from '@/lib/fetch'

interface Agent {
  id: string; name: string; description?: string
  provider: string; baseUrl: string; apiKey?: string; model: string
  systemPrompt?: string; maxTokens: number; temperature: number
  extraConfig: Record<string, unknown>; enabled: boolean
  createdAt: string
}
interface Skill  { id: string; name: string; icon: string; description?: string }
interface EnvVar { id: string; key: string; description?: string }

const EMPTY: Omit<Agent, 'id' | 'createdAt'> = {
  name: '', description: '', provider: 'openai',
  baseUrl: '', apiKey: '', model: '',
  systemPrompt: '', maxTokens: 2048, temperature: 0.7,
  extraConfig: {}, enabled: true,
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [reviewCount, setReviewCount] = useState(0)
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
    const [ag, bt, sk, ev] = await Promise.all([
      fetchJSON<Agent[]>('/api/v1/agents', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
      fetchJSON<Skill[]>('/api/v1/skills', []),
      fetchJSON<EnvVar[]>('/api/v1/envvars', []),
    ])
    setAgents(Array.isArray(ag) ? ag : [])
    setReviewCount(bt.total ?? 0)
    setAllSkills(Array.isArray(sk) ? sk : [])
    setAllEnvVars(Array.isArray(ev) ? ev : [])
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
    setForm({ ...EMPTY })
    setEditing('new')
    setError('')
  }

  function openEdit(a: Agent) {
    setForm({
      name: a.name, description: a.description ?? '',
      provider: a.provider, baseUrl: a.baseUrl,
      apiKey: a.apiKey ?? '', model: a.model,
      systemPrompt: a.systemPrompt ?? '',
      maxTokens: a.maxTokens, temperature: a.temperature,
      extraConfig: a.extraConfig, enabled: a.enabled,
    })
    setEditing(a.id)
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    const isNew = editing === 'new'
    const url   = isNew ? '/api/v1/agents' : `/api/v1/agents/${editing}`
    const method = isNew ? 'POST' : 'PATCH'

    const body = {
      ...form,
      apiKey:      form.apiKey     || null,
      description: form.description || null,
      systemPrompt: form.systemPrompt || null,
      extraConfig: form.extraConfig,
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
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
            <div className="bg-white border-2 border-blue-200 rounded-xl p-6 mb-6 space-y-4">
              <h2 className="font-semibold text-gray-900">{editing === 'new' ? 'New agent' : 'Edit agent'}</h2>

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

              {/* Provider + URL */}
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base URL <span className="text-red-500">*</span></label>
                  <input
                    value={form.baseUrl}
                    onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    placeholder={providerMeta(form.provider)?.urlPlaceholder ?? 'https://...'}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Model + API key */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Model <span className="text-red-500">*</span>
                    {form.provider === 'azure' && <span className="ml-1 text-gray-400">(deployment name)</span>}
                  </label>
                  <input
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder={form.provider === 'azure' ? 'my-gpt4-deployment' : 'gpt-4o-mini'}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    API Key {providerMeta(form.provider)?.needsKey && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder={providerMeta(form.provider)?.needsKey ? 'sk-...' : 'optional'}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Azure api-version */}
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
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span className="font-mono truncate max-w-[200px]">{a.baseUrl}</span>
                            <span>·</span>
                            <span className="font-mono">{a.model}</span>
                            <span>·</span>
                            <span>temp {a.temperature}</span>
                            <span>·</span>
                            <span>{a.maxTokens} tokens</span>
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
