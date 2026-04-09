'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AiAssistButton, type WorkflowResult, type WorkflowTransitionProposal } from '@/components/ai-assist'

const PRESET_COLORS = ['#9CA3AF','#60A5FA','#F59E0B','#8B5CF6','#EF4444','#10B981','#F97316','#EC4899']
const ROLES = ['agent', 'human', 'orchestrator'] as const

interface State {
  id?: string; name: string; label: string; color: string
  isInitial: boolean; isTerminal: boolean; isBlocking: boolean; sortOrder: number
  agentId?: string | null; completionTransitionName?: string | null
}
interface Transition {
  id?: string; fromStateId: string; toStateId: string
  name: string; label: string; allowedRoles: string[]; requiresComment: boolean
}
interface Workflow {
  id: string; name: string; description?: string
  workspaceType?: string | null
  workspacePath?: string | null
  githubRepo?: string | null
  githubBranch?: string | null
  githubToken?: string | null
  webhookUrl?: string | null
  webhookSecret?: string | null
}

export function WorkflowBuilder({
  workflow,
  initialStates,
  initialTransitions,
}: {
  workflow: Workflow
  initialStates: State[]
  initialTransitions: Transition[]
}) {
  const router = useRouter()

  const [name, setName]               = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description ?? '')
  const [wsType, setWsType]           = useState(workflow.workspaceType ?? '')
  const [wsPath, setWsPath]           = useState(workflow.workspacePath ?? '')
  const [ghRepo, setGhRepo]           = useState(workflow.githubRepo ?? '')
  const [ghBranch, setGhBranch]       = useState(workflow.githubBranch ?? 'main')
  const [ghToken, setGhToken]         = useState(workflow.githubToken ?? '')
  const [webhookUrl, setWebhookUrl]   = useState(workflow.webhookUrl ?? '')
  const [webhookSecret, setWebhookSecret] = useState(workflow.webhookSecret ?? '')
  const [states, setStates]           = useState<State[]>(initialStates)
  const [transitions, setTransitions] = useState<Transition[]>(initialTransitions)
  const [tab, setTab]                 = useState<'states' | 'transitions'>('states')
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState('')
  const [error, setError]             = useState('')
  // AI-generated transitions stored by state name (resolved to IDs on save)
  const [pendingTransitions, setPendingTransitions] = useState<WorkflowTransitionProposal[]>([])

  // ─── Drag-to-reorder ──────────────────────────────────────
  const dragSrc = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, i: number) {
    dragSrc.current = i
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(i)
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault()
    const src = dragSrc.current
    if (src === null || src === i) { setDragOver(null); return }
    setStates(prev => {
      const next = [...prev]
      const [item] = next.splice(src, 1)
      next.splice(i, 0, item)
      return next
    })
    dragSrc.current = null
    setDragOver(null)
  }

  function handleDragEnd() {
    dragSrc.current = null
    setDragOver(null)
  }

  // ─── AI assist ────────────────────────────────────────────
  function applyAiWorkflow(result: WorkflowResult) {
    setName(result.name || name)
    if (result.description) setDescription(result.description)
    const newStates = result.states.map((s, i) => ({
      ...s,
      sortOrder: i,
      agentId: null,
      completionTransitionName: null,
    }))
    setStates(prev => [...prev, ...newStates])
    setPendingTransitions(result.transitions ?? [])
    setMsg(`AI generated ${newStates.length} states and ${result.transitions?.length ?? 0} transitions. Review below, then Save.`)
    setTab('states')
  }

  // ─── State form ───────────────────────────────────────────
  const [sForm, setSForm] = useState<State>({ name: '', label: '', color: '#9CA3AF', isInitial: false, isTerminal: false, isBlocking: false, sortOrder: 0 })
  const [editingState, setEditingState] = useState<number | null>(null)

  function openNewState() {
    setSForm({ name: '', label: '', color: '#9CA3AF', isInitial: false, isTerminal: false, isBlocking: false, sortOrder: states.length })
    setEditingState(-1)
  }

  function saveState() {
    if (!sForm.name || !sForm.label) return
    const cleaned = { ...sForm, name: sForm.name.toUpperCase().replace(/\s+/g, '_') }
    if (editingState === -1) {
      setStates(prev => [...prev, cleaned])
    } else if (editingState !== null) {
      setStates(prev => prev.map((s, i) => i === editingState ? cleaned : s))
    }
    setEditingState(null)
  }

  function deleteState(idx: number) {
    const s = states[idx]
    const used = transitions.some(t => t.fromStateId === s.id || t.toStateId === s.id)
    if (used) { setError('Cannot delete state that is used in transitions.'); return }
    setStates(prev => prev.filter((_, i) => i !== idx))
    setError('')
  }

  // ─── Transition form ───────────────────────────────────────
  const [tForm, setTForm] = useState<Transition>({ fromStateId: '', toStateId: '', name: '', label: '', allowedRoles: ['human'], requiresComment: false })
  const [editingTrans, setEditingTrans] = useState<number | null>(null)

  function openNewTransition() {
    setTForm({ fromStateId: '', toStateId: '', name: '', label: '', allowedRoles: ['human'], requiresComment: false })
    setEditingTrans(-1)
  }

  function saveTransition() {
    if (!tForm.fromStateId || !tForm.toStateId || !tForm.name || !tForm.label) return
    const cleaned = { ...tForm, name: tForm.name.toLowerCase().replace(/\s+/g, '_') }
    if (editingTrans === -1) {
      setTransitions(prev => [...prev, cleaned])
    } else if (editingTrans !== null) {
      setTransitions(prev => prev.map((t, i) => i === editingTrans ? cleaned : t))
    }
    setEditingTrans(null)
  }

  function deleteTransition(idx: number) {
    setTransitions(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleRole(role: string) {
    setTForm(prev => ({
      ...prev,
      allowedRoles: prev.allowedRoles.includes(role)
        ? prev.allowedRoles.filter(r => r !== role)
        : [...prev.allowedRoles, role],
    }))
  }

  // ─── Save to API ───────────────────────────────────────────
  async function save() {
    setSaving(true)
    setMsg('')
    setError('')

    try {
      // Update workflow meta + workspace
      await fetch(`/api/v1/workflows/${workflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          workspaceType: wsType || null,
          workspacePath: wsType === 'local'  ? wsPath  || null : null,
          githubRepo:    wsType === 'github' ? ghRepo   || null : null,
          githubBranch:  wsType === 'github' ? ghBranch || 'main' : null,
          githubToken:   wsType === 'github' ? ghToken  || null : null,
          webhookUrl:    webhookUrl    || null,
          webhookSecret: webhookSecret || null,
        }),
      })

      // Bulk upsert all states with current sort order
      const statesRes = await fetch(`/api/v1/workflows/${workflow.id}/states`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(states.map((s, i) => ({ ...s, sortOrder: i }))),
      })
      let savedStates: State[] = states
      if (statesRes.ok) {
        savedStates = await statesRes.json()
        setStates(savedStates)
      }

      // Save new transitions only
      for (const t of transitions) {
        if (!t.id) {
          await fetch(`/api/v1/workflows/${workflow.id}/transitions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          })
        }
      }

      // Resolve and save AI-pending transitions (use saved state names → IDs)
      if (pendingTransitions.length > 0) {
        const nameToId = Object.fromEntries(savedStates.map(s => [s.name, s.id]))
        for (const pt of pendingTransitions) {
          const fromStateId = nameToId[pt.fromStateName.toUpperCase().replace(/\s+/g, '_')]
          const toStateId   = nameToId[pt.toStateName.toUpperCase().replace(/\s+/g, '_')]
          if (!fromStateId || !toStateId) continue
          await fetch(`/api/v1/workflows/${workflow.id}/transitions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...pt, fromStateId, toStateId }),
          })
        }
        setPendingTransitions([])
      }

      setMsg('Saved! Reloading…')
      setTimeout(() => router.refresh(), 500)
    } catch (e) {
      setError('Save failed: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  const stateById = (id: string) => states.find(s => s.id === id)

  return (
    <div className="space-y-6">
      {/* Workflow meta */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Workflow settings</h2>
          <AiAssistButton
            type="workflow"
            label="Generate states with AI"
            onResult={r => applyAiWorkflow(r as WorkflowResult)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Workspace */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700">Workspace</h3>
            <span className="text-xs text-gray-400">— where agents operate</span>
          </div>

          {/* Type selector */}
          <div className="flex gap-2">
            {[
              { value: '',       label: 'None',       icon: '—' },
              { value: 'local',  label: 'Local path', icon: '📁' },
              { value: 'github', label: 'GitHub repo', icon: '🐙' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setWsType(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors
                  ${wsType === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* Local path */}
          {wsType === 'local' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Absolute folder path</label>
              <input
                value={wsPath}
                onChange={e => setWsPath(e.target.value)}
                placeholder="/srv/projects/myapp  or  C:\Projects\myapp"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Server-side path where the agent can read/write files. Must be accessible from where the app runs.
              </p>
            </div>
          )}

          {/* GitHub */}
          {wsType === 'github' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repository <span className="text-red-500">*</span></label>
                  <input
                    value={ghRepo}
                    onChange={e => setGhRepo(e.target.value)}
                    placeholder="owner/repo"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                  <input
                    value={ghBranch}
                    onChange={e => setGhBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Personal Access Token <span className="text-gray-400">(for private repos)</span>
                </label>
                <input
                  type="password"
                  value={ghToken}
                  onChange={e => setGhToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Token is stored as-is. For production, use environment variables instead.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Webhook */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700">Webhook</h3>
            <span className="text-xs text-gray-400">— called on every state transition</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Webhook URL</label>
              <input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://ci.example.com/agenttask/hook"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Receives a POST with task + transition data. Use to trigger CI/CD or sandbox deployment.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Webhook secret <span className="text-gray-400">(optional)</span></label>
              <input
                type="password"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder="random-secret"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Sent as <code className="bg-gray-100 px-1 rounded">X-Webhook-Secret</code> header. Verify on your end.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['states', 'transitions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t} {t === 'states' ? `(${states.length})` : `(${transitions.length})`}
          </button>
        ))}
      </div>

      {/* ── STATES ── */}
      {tab === 'states' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Drag rows to reorder — order determines column order on the kanban board.</p>

          {states.map((s, i) => (
            <div
              key={s.id ?? s.name ?? i}
              draggable={editingState !== i}
              onDragStart={e => handleDragStart(e, i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={e => handleDrop(e, i)}
              onDragLeave={() => setDragOver(null)}
              onDragEnd={handleDragEnd}
              className={`bg-white border rounded-lg p-3 flex items-center gap-2 transition-colors
                ${dragOver === i && dragSrc.current !== i
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200'}
                ${dragSrc.current === i ? 'opacity-40' : 'opacity-100'}`}
            >
              {/* Drag handle */}
              {editingState !== i && (
                <div className="cursor-grab text-gray-300 hover:text-gray-500 shrink-0 select-none" title="Drag to reorder">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 2a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 8a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zm-6 6a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z" />
                  </svg>
                </div>
              )}

              {editingState === i ? (
                <div className="flex-1 grid grid-cols-6 gap-2 items-center">
                  <input value={sForm.name}  onChange={e => setSForm(f => ({ ...f, name: e.target.value }))}  placeholder="NAME" className="col-span-1 px-2 py-1 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <input value={sForm.label} onChange={e => setSForm(f => ({ ...f, label: e.target.value }))} placeholder="Label" className="col-span-2 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <div className="flex gap-1 flex-wrap col-span-2">
                    {PRESET_COLORS.map(c => <button key={c} onClick={() => setSForm(f => ({ ...f, color: c }))} className={`w-5 h-5 rounded-full border-2 ${sForm.color === c ? 'border-gray-800' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={sForm.isInitial}  onChange={e => setSForm(f => ({ ...f, isInitial: e.target.checked }))}  /> Initial</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={sForm.isTerminal} onChange={e => setSForm(f => ({ ...f, isTerminal: e.target.checked }))} /> Terminal</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={sForm.isBlocking} onChange={e => setSForm(f => ({ ...f, isBlocking: e.target.checked }))} /> HITL 🔒</label>
                  </div>
                  <div className="col-span-6 flex gap-2">
                    <button onClick={saveState} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
                    <button onClick={() => setEditingState(null)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <div>
                      <span className="text-xs font-mono text-gray-400">{s.name}</span>
                      <span className="ml-2 text-sm font-medium text-gray-800">{s.label}</span>
                      {s.isInitial  && <span className="ml-1 text-xs bg-green-100 text-green-700 px-1 rounded">initial</span>}
                      {s.isTerminal && <span className="ml-1 text-xs bg-gray-100  text-gray-600  px-1 rounded">terminal</span>}
                      {s.isBlocking && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 rounded">HITL</span>}
                      {s.agentId && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1 rounded font-mono">
                          🤖 {s.agentId}
                        </span>
                      )}
                      {!s.id        && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1 rounded">unsaved</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setSForm(s); setEditingState(i) }} className="text-xs text-gray-400 hover:text-gray-700">Edit</button>
                    {!s.id && <button onClick={() => deleteState(i)} className="text-xs text-red-400 hover:text-red-600">Delete</button>}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* New state form */}
          {editingState === -1 ? (
            <div className="bg-white border-2 border-blue-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">New state</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Machine name (auto-uppercased)</label>
                  <input value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="PENDING_REVIEW" className="w-full px-2 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Human label</label>
                  <input value={sForm.label} onChange={e => setSForm(f => ({ ...f, label: e.target.value }))} placeholder="Pending review" className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map(c => <button key={c} onClick={() => setSForm(f => ({ ...f, color: c }))} className={`w-6 h-6 rounded-full border-2 ${sForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'} transition-transform`} style={{ backgroundColor: c }} />)}
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={sForm.isInitial}  onChange={e => setSForm(f => ({ ...f, isInitial: e.target.checked }))}  className="rounded" /> Initial state</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={sForm.isTerminal} onChange={e => setSForm(f => ({ ...f, isTerminal: e.target.checked }))} className="rounded" /> Terminal state</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={sForm.isBlocking} onChange={e => setSForm(f => ({ ...f, isBlocking: e.target.checked }))} className="rounded" /> HITL checkpoint 🔒</label>
              </div>
              <div className="flex gap-2">
                <button onClick={saveState} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add state</button>
                <button onClick={() => setEditingState(null)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={openNewState} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Add state
            </button>
          )}
        </div>
      )}

      {/* ── TRANSITIONS ── */}
      {tab === 'transitions' && (
        <div className="space-y-3">
          {/* Pending AI transitions */}
          {pendingTransitions.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-purple-700">✨ AI-generated transitions (will be saved with states)</p>
              {pendingTransitions.map((pt, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-purple-800">
                  <span className="font-mono bg-purple-100 px-1.5 py-0.5 rounded">{pt.fromStateName}</span>
                  <span>→</span>
                  <span className="font-mono bg-purple-100 px-1.5 py-0.5 rounded">{pt.toStateName}</span>
                  <span className="text-purple-500">via</span>
                  <span className="font-mono">{pt.name}</span>
                  <span className="text-purple-400">"{pt.label}"</span>
                  <button onClick={() => setPendingTransitions(prev => prev.filter((_, j) => j !== i))}
                    className="ml-auto text-purple-400 hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
          )}

          {transitions.map((t, i) => {
            const from = stateById(t.fromStateId)
            const to   = stateById(t.toStateId)
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: (from?.color ?? '#ccc') + '20', color: from?.color }}>{from?.label ?? t.fromStateId}</span>
                  <span className="text-gray-400 text-xs">→</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: (to?.color ?? '#ccc') + '20', color: to?.color }}>{to?.label ?? t.toStateId}</span>
                  <span className="text-xs text-gray-500 font-mono">{t.name}</span>
                  <span className="text-xs text-gray-400">"{t.label}"</span>
                  {t.allowedRoles.map(r => (
                    <span key={r} className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded">{r}</span>
                  ))}
                  {t.requiresComment && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded">requires comment</span>}
                  {!t.id && <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">unsaved</span>}
                </div>
                {!t.id && <button onClick={() => deleteTransition(i)} className="text-xs text-red-400 hover:text-red-600 ml-2 shrink-0">Delete</button>}
              </div>
            )
          })}

          {/* New transition form */}
          {editingTrans === -1 ? (
            <div className="bg-white border-2 border-blue-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">New transition</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">From state</label>
                  <select value={tForm.fromStateId} onChange={e => setTForm(f => ({ ...f, fromStateId: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select…</option>
                    {states.filter(s => s.id && !s.isTerminal).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">To state</label>
                  <select value={tForm.toStateId} onChange={e => setTForm(f => ({ ...f, toStateId: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select…</option>
                    {states.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Machine name (auto-lowercased)</label>
                  <input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} placeholder="submit_review" className="w-full px-2 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Human label</label>
                  <input value={tForm.label} onChange={e => setTForm(f => ({ ...f, label: e.target.value }))} placeholder="Submit for review" className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Allowed roles</label>
                <div className="flex gap-3">
                  {ROLES.map(r => (
                    <label key={r} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={tForm.allowedRoles.includes(r)} onChange={() => toggleRole(r)} className="rounded" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={tForm.requiresComment} onChange={e => setTForm(f => ({ ...f, requiresComment: e.target.checked }))} className="rounded" />
                Requires comment
              </label>
              <div className="flex gap-2">
                <button onClick={saveTransition} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add transition</button>
                <button onClick={() => setEditingTrans(null)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={openNewTransition} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Add transition
            </button>
          )}
        </div>
      )}

      {/* Error / save */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg   && <p className="text-sm text-green-600">{msg}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
