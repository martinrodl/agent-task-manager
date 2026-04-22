'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { priorityLabel, timeAgo, initials } from '@/lib/utils'
import { Settings, Bot, ShieldCheck, GripVertical } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface State {
  id: string; name: string; label: string; color: string
  isBlocking: boolean; isTerminal: boolean; isInitial: boolean
  agentId: string | null; completionTransitionName: string | null
  sortOrder: number
}
interface Transition {
  id: string; name: string; label: string; fromStateId: string
  toState: { id: string; name: string; label: string }
}
interface Task {
  id: string; title: string; description?: string
  assignedTo: string | null; priority: number
  stateId: string; state: State; updatedAt: string; createdAt: string
  parentId?: string | null
  _count?: { subtasks: number }
}
interface Workflow {
  id: string; name: string
  states: State[]
  transitions: Transition[]
}

// ─── Drag context ─────────────────────────────────────────────────────────────

interface DragState {
  taskId: string
  fromStateId: string
}

// ─── Column header settings panel ────────────────────────────────────────────

function ColumnSettings({
  state,
  workflowId,
  transitions,
  onSaved,
  onClose,
}: {
  state: State
  workflowId: string
  transitions: Transition[]
  onSaved: (updated: State) => void
  onClose: () => void
}) {
  const [agentId, setAgentId]   = useState(state.agentId ?? '')
  const [doneTrans, setDoneTrans] = useState(state.completionTransitionName ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const outgoing = transitions.filter(t => t.fromStateId === state.id)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function save() {
    setSaving(true)
    setError('')
    const res = await fetch(
      `/api/v1/workflows/${workflowId}/states?stateId=${state.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId || null,
          completionTransitionName: doneTrans || null,
        }),
      }
    )
    if (res.ok) {
      const updated = await res.json()
      onSaved(updated)
      onClose()
    } else {
      setError('Save failed')
    }
    setSaving(false)
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 w-72 bg-surface-2 border border-border-strong rounded-xl shadow-xl p-4 space-y-3"
    >
      <p className="section-title">Column settings</p>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">
          Auto-assign agent
        </label>
        <input
          value={agentId}
          onChange={e => setAgentId(e.target.value)}
          placeholder="claude-agent-01"
          className="input-field font-mono text-xs"
        />
        <p className="text-xs text-text-tertiary mt-0.5">Tasks entering this state are auto-assigned.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">
          Agent &quot;done&quot; transition
        </label>
        <select
          value={doneTrans}
          onChange={e => setDoneTrans(e.target.value)}
          className="input-field text-xs"
        >
          <option value="">None</option>
          {outgoing.map(t => (
            <option key={t.id} value={t.name}>
              {t.label} → {t.toState.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-tertiary mt-0.5">Which transition the agent calls when finished.</p>
      </div>

      {error && <p className="text-xs text-err">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 bg-accent text-text-inverse text-xs font-display font-medium rounded-lg hover:shadow-glow-sm disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  processing,
  onDragStart,
}: {
  task: Task
  processing: boolean
  onDragStart: (taskId: string, fromStateId: string) => void
}) {
  const priColors = ['var(--text-tertiary)', '#60A5FA', 'var(--warn)', 'var(--err)']
  const priColor  = priColors[task.priority] ?? priColors[0]

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id, task.stateId)
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <Link
        href={`/tasks/${task.id}`}
        draggable={false}
        className={`block rounded-lg transition-all duration-200 group relative border ${
          processing
            ? 'bg-accent/[0.06] border-accent/30 hover:border-accent/50 animate-pulse-glow'
            : 'bg-surface-2 border-border hover:border-border-strong'
        }`}
        style={{ borderLeft: `3px solid ${processing ? 'var(--accent)' : priColor}` }}
      >
        <div className="p-3">
          {/* Top meta */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-text-tertiary tracking-wider">{task.id.slice(-6).toUpperCase()}</span>
            <div className="flex items-center gap-1.5">
              {processing && (
                <span className="flex items-center gap-1 text-[10px] text-accent font-display font-medium uppercase tracking-wider">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Processing
                </span>
              )}
              {task.state.isBlocking && !processing && (
                <span className="badge-warn text-[10px] py-0">Review</span>
              )}
            </div>
          </div>

          {/* Title */}
          <p className="text-sm font-medium text-text-primary line-clamp-2 group-hover:text-accent leading-snug transition-colors">
            {task.title}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  title={priorityLabel(task.priority)}
                  style={{ backgroundColor: priColor }}
                />
                <span className="text-[11px] text-text-tertiary">{priorityLabel(task.priority)}</span>
              </div>
              {(task._count?.subtasks ?? 0) > 0 && (
                <span className="text-[11px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded">
                  ↳ {task._count!.subtasks}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-tertiary">{timeAgo(task.updatedAt)}</span>
              {task.assignedTo ? (
                <div
                  className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ring-accent/30"
                  title={task.assignedTo}
                >
                  {initials(task.assignedTo)}
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center ring-1 ring-border" title="Unassigned">
                  <span className="text-[10px] text-text-tertiary">?</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  state,
  tasks,
  workflowId,
  transitions,
  processingTaskIds,
  onStateUpdated,
  onDragStart,
  onDrop,
}: {
  state: State
  tasks: Task[]
  workflowId: string
  transitions: Transition[]
  processingTaskIds: Set<string>
  onStateUpdated: (s: State) => void
  onDragStart: (taskId: string, fromStateId: string) => void
  onDrop: (toStateId: string) => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragOver, setDragOver]         = useState(false)

  return (
    <div className="flex flex-col shrink-0 w-[272px]">
      {/* Column header */}
      <div className="mb-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-surface-0" style={{ backgroundColor: state.color }} />
            <span className="text-xs font-display font-semibold text-text-secondary uppercase tracking-wider">
              {state.label}
            </span>
            <span className="text-[10px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded-full font-display font-medium min-w-[20px] text-center">
              {tasks.length}
            </span>
          </div>
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-2 rounded transition-colors"
            title="Configure column"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Agent badge */}
        {state.agentId && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <Bot className="w-3 h-3 text-accent" />
            <span className="font-mono truncate">{state.agentId}</span>
            {state.completionTransitionName && (
              <>
                <span className="text-border-strong">·</span>
                <span className="text-ok">done: {state.completionTransitionName}</span>
              </>
            )}
          </div>
        )}

        {/* HITL badge */}
        {state.isBlocking && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-warn">
            <ShieldCheck className="w-3 h-3" />
            <span>Human review required</span>
          </div>
        )}

        {settingsOpen && (
          <ColumnSettings
            state={state}
            workflowId={workflowId}
            transitions={transitions}
            onSaved={onStateUpdated}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* Cards — drop zone */}
      <div
        className={`flex-1 space-y-2 min-h-[120px] rounded-lg transition-all duration-200 ${
          dragOver ? 'bg-accent/[0.06] ring-1 ring-accent/30 ring-inset' : ''
        }`}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(state.id) }}
      >
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            processing={processingTaskIds.has(task.id)}
            onDragStart={onDragStart}
          />
        ))}

        {tasks.length === 0 && (
          <div className={`h-20 border border-dashed rounded-lg flex items-center justify-center transition-all duration-200 ${
            dragOver ? 'border-accent/40 bg-accent/[0.04]' : 'border-border'
          }`}>
            <span className="text-[11px] text-text-tertiary font-display">{dragOver ? 'Drop here' : 'No tasks'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function KanbanBoard({
  workflowId,
  filterSearch = '',
  filterAssignedTo = '',
  filterPriority,
}: {
  workflowId: string
  filterSearch?: string
  filterAssignedTo?: string
  filterPriority?: number
}) {
  const [workflow, setWorkflow]        = useState<Workflow | null>(null)
  const [tasksByState, setByState]     = useState<Record<string, Task[]>>({})
  const [loading, setLoading]          = useState(true)
  const [dragState, setDragState]      = useState<DragState | null>(null)
  const [dropError, setDropError]      = useState('')
  const [processingTaskIds, setProcessing] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [wfRes, tasksRes] = await Promise.all([
      fetch(`/api/v1/workflows/${workflowId}`),
      fetch(`/api/v1/tasks?workflowId=${workflowId}&limit=200`),
    ])
    if (!wfRes.ok) return
    const [wf, tasksData]: [Workflow, { data: Task[] }] = await Promise.all([
      wfRes.json(), tasksRes.json(),
    ])

    setWorkflow(wf)

    const grouped: Record<string, Task[]> = {}
    for (const s of wf.states) grouped[s.id] = []
    for (const t of (tasksData.data ?? [])) {
      if (grouped[t.stateId]) grouped[t.stateId].push(t)
    }
    setByState(grouped)
    setLoading(false)
  }, [workflowId])

  useEffect(() => {
    load()
    const es = new EventSource(`/api/v1/stream/tasks?workflowId=${workflowId}`)
    es.addEventListener('task_updated', () => load())
    es.addEventListener('task_transitioned', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.taskId) setProcessing(prev => { const s = new Set(prev); s.delete(d.taskId); return s })
      } catch { /* ignore */ }
      load()
    })
    es.addEventListener('task_processing', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.taskId) setProcessing(prev => new Set([...prev, d.taskId]))
      } catch { /* ignore */ }
    })
    es.onerror = () => {
      es.close()
      setTimeout(() => load(), 5_000)
    }
    return () => es.close()
  }, [load, workflowId])

  function handleStateUpdated(updated: State) {
    setWorkflow(prev =>
      prev ? { ...prev, states: prev.states.map(s => s.id === updated.id ? updated : s) } : prev
    )
  }

  async function handleDrop(toStateId: string) {
    if (!dragState || !workflow) return
    const { taskId, fromStateId } = dragState
    setDragState(null)

    if (fromStateId === toStateId) return

    const transition = workflow.transitions.find(
      t => t.fromStateId === fromStateId && t.toState.id === toStateId
    )

    if (!transition) {
      const fromLabel = workflow.states.find(s => s.id === fromStateId)?.label ?? fromStateId
      const toLabel   = workflow.states.find(s => s.id === toStateId)?.label   ?? toStateId
      setDropError(`No transition from "${fromLabel}" to "${toLabel}"`)
      setTimeout(() => setDropError(''), 3500)
      return
    }

    setByState(prev => {
      const next = { ...prev }
      const task = (prev[fromStateId] ?? []).find(t => t.id === taskId)
      if (!task) return prev
      next[fromStateId] = (prev[fromStateId] ?? []).filter(t => t.id !== taskId)
      const toState = workflow.states.find(s => s.id === toStateId)!
      next[toStateId]   = [...(prev[toStateId] ?? []), { ...task, stateId: toStateId, state: toState }]
      return next
    })

    const res = await fetch(`/api/v1/tasks/${taskId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionName: transition.name }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setDropError(data.message ?? 'Transition failed')
      setTimeout(() => setDropError(''), 3500)
      load()
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="w-[272px] h-64 bg-surface-2 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (!workflow) return <div className="text-err py-8">Workflow not found.</div>

  const searchLower = filterSearch.toLowerCase()
  const filteredByState: Record<string, Task[]> = {}
  for (const [stateId, tasks] of Object.entries(tasksByState)) {
    filteredByState[stateId] = tasks.filter(t => {
      if (searchLower && !t.title.toLowerCase().includes(searchLower)) return false
      if (filterAssignedTo && t.assignedTo !== filterAssignedTo) return false
      if (filterPriority !== undefined && t.priority !== filterPriority) return false
      return true
    })
  }
  const isFiltered = !!(filterSearch || filterAssignedTo || filterPriority !== undefined)
  const filteredTotal = Object.values(filteredByState).reduce((s, a) => s + a.length, 0)

  return (
    <div>
      {dropError && (
        <div className="mb-3 px-4 py-2 bg-err-dim border border-err/20 rounded-lg text-sm text-err">
          {dropError}
        </div>
      )}
      {isFiltered && (
        <p className="mb-3 text-xs text-text-tertiary font-display">{filteredTotal} task{filteredTotal !== 1 ? 's' : ''} match</p>
      )}
      <div
        className="flex gap-5 overflow-x-auto pb-6 pt-1 scrollbar-thin min-h-[400px]"
        onDragEnd={() => setDragState(null)}
      >
        {workflow.states.map(state => (
          <Column
            key={state.id}
            state={state}
            tasks={filteredByState[state.id] ?? []}
            workflowId={workflowId}
            transitions={workflow.transitions}
            processingTaskIds={processingTaskIds}
            onStateUpdated={handleStateUpdated}
            onDragStart={(taskId, fromStateId) => setDragState({ taskId, fromStateId })}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  )
}
