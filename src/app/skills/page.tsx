'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/nav'
import { AiAssistButton, type SkillResult } from '@/components/ai-assist'
import { fetchJSON } from '@/lib/fetch'
import { SKILL_TEMPLATES, TEMPLATE_CATEGORIES } from '@/lib/skill-templates'

interface Skill  { id: string; name: string; description?: string; icon: string; content: string }
interface EnvVar { id: string; key: string; value: string; description?: string }

const SKILL_EMPTY = { name: '', description: '', icon: '🔧', content: '' }
const ENV_EMPTY   = { key: '', value: '', description: '' }

const ICON_PRESETS = ['🔧','🌐','📁','🐙','🔍','💾','📧','🔑','🤖','📊','🛠️','⚡','🔐','📝','🗄️']

export default function SkillsPage() {
  const [tab, setTab]           = useState<'skills' | 'envvars'>('skills')
  const [reviewCount, setReviewCount] = useState(0)

  // Skills
  const [skills, setSkills]         = useState<Skill[]>([])
  const [sForm, setSForm]           = useState({ ...SKILL_EMPTY })
  const [sEditing, setSEditing]     = useState<string | null>(null)
  const [sSaving, setSSaving]       = useState(false)
  const [sError, setSError]         = useState('')
  const [templateCat, setTemplateCat] = useState<string>('all')

  // Env vars
  const [envVars, setEnvVars]       = useState<EnvVar[]>([])
  const [eForm, setEForm]           = useState({ ...ENV_EMPTY })
  const [eEditing, setEEditing]     = useState<string | null>(null)
  const [eSaving, setESaving]       = useState(false)
  const [eError, setEError]         = useState('')
  const [showValue, setShowValue]   = useState<string | null>(null)

  async function load() {
    const [sk, ev, bt] = await Promise.all([
      fetchJSON<Skill[]>('/api/v1/skills', []),
      fetchJSON<EnvVar[]>('/api/v1/envvars', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
    ])
    setSkills(sk)
    setEnvVars(ev)
    setReviewCount(bt.total ?? 0)
  }

  useEffect(() => { load() }, [])

  // ── Skills ──────────────────────────────────────────────────

  async function saveSkill() {
    if (!sForm.name || !sForm.content) { setSError('Name and content are required'); return }
    setSSaving(true); setSError('')
    const isNew = sEditing === 'new'
    const res = await fetch(isNew ? '/api/v1/skills' : `/api/v1/skills/${sEditing}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sForm),
    })
    if (res.ok) { await load(); setSEditing(null) }
    else { const d = await res.json().catch(() => ({})); setSError(d.error ?? 'Save failed') }
    setSSaving(false)
  }

  async function deleteSkill(id: string) {
    if (!confirm('Delete this skill?')) return
    await fetch(`/api/v1/skills/${id}`, { method: 'DELETE' })
    await load()
  }

  // ── Env Vars ────────────────────────────────────────────────

  async function saveEnvVar() {
    if (!eForm.key || !eForm.value) { setEError('Key and value are required'); return }
    setESaving(true); setEError('')
    const isNew = eEditing === 'new'
    const res = await fetch(isNew ? '/api/v1/envvars' : `/api/v1/envvars/${eEditing}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eForm),
    })
    if (res.ok) { await load(); setEEditing(null); setEForm({ ...ENV_EMPTY }) }
    else { const d = await res.json().catch(() => ({})); setEError(d.error ?? 'Save failed') }
    setESaving(false)
  }

  async function deleteEnvVar(id: string) {
    if (!confirm('Delete this key?')) return
    await fetch(`/api/v1/envvars/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="flex h-full">
      <Nav reviewCount={reviewCount} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Skills & Keys</h1>
            <p className="text-sm text-gray-500 mt-0.5">Define reusable skills and secret keys, then assign them to agents.</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            {([['skills', '🔧 Skills'], ['envvars', '🔑 API Keys & Env Vars']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${tab === v ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* ── SKILLS tab ── */}
          {tab === 'skills' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">Skills are injected as extra instructions into the agent's system prompt.</p>
                <button
                  onClick={() => { setSForm({ ...SKILL_EMPTY }); setSEditing('new'); setSError('') }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  + New skill
                </button>
              </div>

              {/* Template picker — shown when no form open */}
              {!sEditing && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">⚡ Start from template</p>
                    <div className="flex gap-1 flex-wrap justify-end">
                      <button
                        onClick={() => setTemplateCat('all')}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                          ${templateCat === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:border-gray-500'}`}
                      >
                        All
                      </button>
                      {TEMPLATE_CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setTemplateCat(cat)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                            ${templateCat === cat ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:border-gray-500'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {SKILL_TEMPLATES
                      .filter(t => templateCat === 'all' || t.category === templateCat)
                      .map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSForm({ name: t.name, description: t.description, icon: t.icon, content: t.content })
                            setSEditing('new')
                            setSError('')
                          }}
                          className="flex items-start gap-2.5 p-3 text-left bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all group"
                        >
                          <span className="text-xl mt-0.5 shrink-0">{t.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate">{t.name}</span>
                              {t.free
                                ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">free</span>
                                : <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">paid</span>
                              }
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
                            {t.envVarHints.length > 0 && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                Needs: {t.envVarHints.map(h => h.key).join(', ')}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Skill form */}
              {sEditing && (
                <div className="bg-white border-2 border-blue-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{sEditing === 'new' ? 'New skill' : 'Edit skill'}</h3>
                    <AiAssistButton
                      type="skill"
                      onResult={r => {
                        const s = r as SkillResult
                        setSForm(f => ({
                          ...f,
                          ...(s.name        ? { name: s.name }               : {}),
                          ...(s.description ? { description: s.description } : {}),
                          ...(s.icon        ? { icon: s.icon }               : {}),
                          ...(s.content     ? { content: s.content }         : {}),
                        }))
                        setSError('')
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                      <input
                        value={sForm.name}
                        onChange={e => setSForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="web_search"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input
                        value={sForm.description}
                        onChange={e => setSForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Search the web for information"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Icon</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {ICON_PRESETS.map(ic => (
                        <button
                          key={ic}
                          onClick={() => setSForm(f => ({ ...f, icon: ic }))}
                          className={`w-8 h-8 text-lg rounded-lg border-2 transition-colors
                            ${sForm.icon === ic ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-300'}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Instructions <span className="text-red-500">*</span>
                      <span className="ml-1 font-normal text-gray-400">— injected verbatim into system prompt (Markdown supported)</span>
                    </label>
                    <textarea
                      value={sForm.content}
                      onChange={e => setSForm(f => ({ ...f, content: e.target.value }))}
                      rows={8}
                      placeholder={`## Web Search\nYou can search the web using the following format:\n\n<search>your query here</search>\n\nAlways cite your sources.`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {/* Env var hints from template */}
                  {(() => {
                    const tpl = SKILL_TEMPLATES.find(t => t.name === sForm.name)
                    if (!tpl || tpl.envVarHints.length === 0) return null
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
                        <p className="text-xs font-medium text-amber-800">🔑 Required API keys</p>
                        {tpl.envVarHints.map(h => (
                          <p key={h.key} className="text-xs text-amber-700">
                            <code className="font-mono bg-amber-100 px-1 rounded">{h.key}</code>
                            {' — '}{h.description}
                            {tpl.setupUrl && (
                              <a href={tpl.setupUrl} target="_blank" rel="noreferrer" className="ml-1 underline hover:text-amber-900">Get key →</a>
                            )}
                          </p>
                        ))}
                        <p className="text-xs text-amber-600 mt-1">
                          Add these in{' '}
                          <button onClick={() => setTab('envvars')} className="underline font-medium">API Keys & Env Vars tab</button>
                          {' '}and assign them to the agent.
                        </p>
                      </div>
                    )
                  })()}

                  {sError && <p className="text-sm text-red-600">{sError}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveSkill} disabled={sSaving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {sSaving ? 'Saving…' : 'Save skill'}
                    </button>
                    <button onClick={() => setSEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  </div>
                </div>
              )}

              {/* Skill list */}
              {skills.length === 0 && !sEditing ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <p className="text-2xl mb-2">🔧</p>
                  <p className="text-gray-500">No skills yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Skills add extra instructions to agents — e.g. how to use tools, follow conventions, or access services.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {skills.map(s => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{s.icon}</span>
                          <div>
                            <p className="font-semibold text-gray-900">{s.name}</p>
                            {s.description && <p className="text-sm text-gray-500">{s.description}</p>}
                            <p className="text-xs text-gray-400 mt-1 font-mono line-clamp-1">{s.content.slice(0, 80)}…</p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 ml-4">
                          <button
                            onClick={() => { setSForm({ name: s.name, description: s.description ?? '', icon: s.icon, content: s.content }); setSEditing(s.id); setSError('') }}
                            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button onClick={() => deleteSkill(s.id)} className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ENV VARS tab ── */}
          {tab === 'envvars' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">Secrets injected as available credentials into the agent's prompt context.</p>
                <button
                  onClick={() => { setEForm({ ...ENV_EMPTY }); setEEditing('new'); setEError('') }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  + New key
                </button>
              </div>

              {/* EnvVar form */}
              {eEditing && (
                <div className="bg-white border-2 border-blue-200 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-gray-900">{eEditing === 'new' ? 'New key' : 'Update key'}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Key name <span className="text-red-500">*</span></label>
                      <input
                        value={eForm.key}
                        onChange={e => setEForm(f => ({ ...f, key: e.target.value }))}
                        placeholder="GITHUB_TOKEN"
                        disabled={eEditing !== 'new'}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      />
                      <p className="text-xs text-gray-400 mt-0.5">Auto-uppercased. Used as variable name in prompt.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input
                        value={eForm.description}
                        onChange={e => setEForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="GitHub personal access token"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Value <span className="text-red-500">*</span>
                      {eEditing !== 'new' && <span className="ml-1 font-normal text-gray-400">— leave blank to keep current</span>}
                    </label>
                    <input
                      type="password"
                      value={eForm.value}
                      onChange={e => setEForm(f => ({ ...f, value: e.target.value }))}
                      placeholder={eEditing !== 'new' ? '(unchanged)' : 'ghp_xxxxxxxxxxxx'}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {eError && <p className="text-sm text-red-600">{eError}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveEnvVar} disabled={eSaving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {eSaving ? 'Saving…' : 'Save key'}
                    </button>
                    <button onClick={() => setEEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  </div>
                </div>
              )}

              {/* EnvVar list */}
              {envVars.length === 0 && !eEditing ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <p className="text-2xl mb-2">🔑</p>
                  <p className="text-gray-500">No keys yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Store API keys and secrets here, then assign them to specific agents.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {envVars.map(v => (
                    <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🔑</span>
                          <div>
                            <p className="font-semibold text-gray-900 font-mono">{v.key}</p>
                            {v.description && <p className="text-sm text-gray-500">{v.description}</p>}
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">
                              {showValue === v.id ? v.value : '••••••••'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 ml-4">
                          <button
                            onClick={() => setShowValue(showValue === v.id ? null : v.id)}
                            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                          >
                            {showValue === v.id ? 'Hide' : 'Show'}
                          </button>
                          <button
                            onClick={() => { setEForm({ key: v.key, value: '', description: v.description ?? '' }); setEEditing(v.id); setEError('') }}
                            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button onClick={() => deleteEnvVar(v.id)} className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>Security note:</strong> Values are stored in the database as plaintext. For production, use environment variables or a secrets manager and reference them by name only.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
