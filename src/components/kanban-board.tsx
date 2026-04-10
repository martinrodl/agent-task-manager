'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { priorityBorderColor, priorityLabel, timeAgo, initials } from '@/lib/utils'

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
      className="absolute top-full left-0 z-50 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-4 space-y-3"
    >
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Column settings</p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          🤖 Auto-assign agent
        </label>
        <input
          value={agentId}
          onChange={e => setAgentId(e.target.value)}
          placeholder="claude-agent-01"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-0.5">Tasks entering this state are auto-assigned to this agent.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          ✅ Agent "done" transition
        </label>
        <select
          value={doneTrans}
          onChange={e => setDoneTrans(e.target.value)}
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None</option>
          {outgoing.map(t => (
            <option key={t.id} value={t.name}>
              {t.label} → {t.toState.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">Which transition the agent calls when finished.</p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
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
  const priColors = ['#9CA3AF', '#60A5FA', '#F59E0B', '#EF4444']
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
        className={`block border rounded-lg hover:shadow-md transition-all group relative ${
          processing
            ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        style={{ borderLeft: `3px solid ${processing ? '#3B82F6' : priColor}` }}
      >
        <div className="p-3">
          {/* Top meta */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-400">{task.id.slice(-6).toUpperCase()}</span>
            <div className="flex items-center gap-1.5">
              {processing && (
                <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Processing
                </span>
              )}
              {task.state.isBlocking && !processing && (
                <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">
                  REVIEW
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <p className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-blue-700 leading-snug">
            {task.title}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  title={priorityLabel(task.priority)}
                  style={{ backgroundColor: priColor }}
                />
                <span className="text-xs text-gray-400">{priorityLabel(task.priority)}</span>
              </div>
              {(task._count?.subtasks ?? 0) > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  ↳ {task._count!.subtasks}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{timeAgo(task.updatedAt)}</span>
              {task.assignedTo ? (
                <div
                  className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
                  title={task.assignedTo}
                >
                  {initials(task.assignedTo)}
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center" title="Unassigned">
                  <span className="text-xs text-gray-400">?</span>
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
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: state.color }} />
            <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {state.label}
            </span>
            <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium min-w-[20px] text-center">
              {tasks.length}
            </span>
          </div>
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Configure column"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Agent badge */}
        {state.agentId && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <span className="text-blue-500">🤖</span>
            <span className="font-mono truncate">{state.agentId}</span>
            {state.completionTransitionName && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-green-600">done: {state.completionTransitionName}</span>
              </>
            )}
          </div>
        )}

        {/* HITL badge */}
        {state.isBlocking && (
          <div className="mt-1 flex items-center gap-1 text-xs text-purple-600">
            <span>🔒</span>
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
        className={`flex-1 space-y-2 min-h-[120px] rounded-lg transition-colors ${
          dragOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''
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
          <div className={`h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
            dragOver ? 'border-blue-300' : 'border-gray-200'
          }`}>
            <span className="text-xs text-gray-300">{dragOver ? 'Drop here' : 'No tasks'}</span>
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
      // Remove from processing when agent finishes
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

    // Find a valid transition from fromState → toState
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

    // Optimistically move the card
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
      // Revert optimistic update
      load()
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="w-[272px] h-64 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (!workflow) return <div className="text-red-500 py-8">Workflow not found.</div>

  // Apply client-side filters
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
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {dropError}
        </div>
      )}
      {isFiltered && (
        <p className="mb-3 text-xs text-gray-400">{filteredTotal} task{filteredTotal !== 1 ? 's' : ''} match</p>
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
