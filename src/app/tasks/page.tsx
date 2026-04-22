'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { KanbanBoard } from '@/components/kanban-board'
import { fetchJSON } from '@/lib/fetch'
import { Plus, Search, X } from 'lucide-react'

interface Workflow { id: string; name: string; projectId?: string | null }
interface Project  { id: string; name: string; color: string; slug: string }

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: '3', label: 'Critical' },
  { value: '2', label: 'High' },
  { value: '1', label: 'Medium' },
  { value: '0', label: 'Low' },
]

function TasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [workflows, setWorkflows]   = useState<Workflow[]>([])
  const [projects, setProjects]     = useState<Project[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [loaded, setLoaded]         = useState(false)

  const [search, setSearch]         = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [priority, setPriority]     = useState('')
  const [agentId, setAgentId]       = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('agentId') ?? '' : ''
  )

  const workflowId = searchParams.get('workflowId') ?? ''
  const projectId  = searchParams.get('projectId')  ?? ''

  useEffect(() => {
    Promise.all([
      fetchJSON<Workflow[]>('/api/v1/workflows', []),
      fetchJSON<Project[]>('/api/v1/projects', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
    ]).then(([wfs, projs, bt]) => {
      const wfList: Workflow[] = Array.isArray(wfs) ? wfs : []
      const projList: Project[] = Array.isArray(projs) ? projs : []
      setWorkflows(wfList)
      setProjects(projList)
      setReviewCount(bt.total ?? 0)
      setLoaded(true)

      if (!searchParams.get('workflowId') && !searchParams.get('projectId')) {
        const first = wfList[0]
        if (first) router.replace(`/tasks?workflowId=${first.id}`)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function saveAgentId(v: string) {
    setAgentId(v)
    if (typeof window !== 'undefined') localStorage.setItem('agentId', v)
  }

  const hasFilters = search || assignedToMe || priority

  const visibleWorkflows = projectId
    ? workflows.filter(w => w.projectId === projectId)
    : workflows

  const activeWorkflow = workflows.find(w => w.id === workflowId)
  const activeProject  = projects.find(p => p.id === projectId)

  useEffect(() => {
    if (projectId && !workflowId) {
      const first = workflows.find(w => w.projectId === projectId)
      if (first) router.replace(`/tasks?projectId=${projectId}&workflowId=${first.id}`)
    }
  }, [projectId, workflowId, workflows]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) {
    return (
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="flex gap-4 p-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-[272px] h-64 bg-surface-2 rounded-lg animate-pulse" />
          ))}
        </div>
      </main>
    )
  }

  return (
    <>
      <Nav reviewCount={reviewCount} />
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="px-8 pt-6 pb-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              {activeProject && (
                <p className="text-[11px] text-text-tertiary mb-0.5 flex items-center gap-1.5 font-display uppercase tracking-wider">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color }} />
                  {activeProject.name}
                </p>
              )}
              <h1 className="text-xl font-display font-bold text-text-primary tracking-tight">
                {activeWorkflow ? activeWorkflow.name : activeProject ? activeProject.name : 'Tasks'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {projects.length > 0 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => router.push('/tasks')}
                    className={`px-2.5 py-1 text-xs font-display rounded-full border transition-all duration-200 ${
                      !projectId ? 'bg-accent/15 text-accent border-accent/30' : 'bg-surface-2 text-text-secondary border-border hover:border-border-strong'
                    }`}
                  >
                    All
                  </button>
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/tasks?projectId=${p.id}`)}
                      className={`px-2.5 py-1 text-xs font-display rounded-full border transition-all duration-200 ${
                        projectId === p.id
                          ? 'text-white border-transparent'
                          : 'bg-surface-2 text-text-secondary border-border hover:border-border-strong'
                      }`}
                      style={projectId === p.id ? { backgroundColor: p.color, borderColor: p.color } : {}}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <Link
                href={workflowId ? `/tasks/new?workflowId=${workflowId}` : '/tasks/new'}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow transition-all duration-200 active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                New task
              </Link>
            </div>
          </div>

          {/* Workflow tabs */}
          {visibleWorkflows.length > 0 && (
            <div className="flex gap-0 mb-4 border-b border-border overflow-x-auto">
              {visibleWorkflows.map(wf => (
                <Link
                  key={wf.id}
                  href={`/tasks?${projectId ? `projectId=${projectId}&` : ''}workflowId=${wf.id}`}
                  className={`px-4 py-2.5 text-sm font-display font-medium transition-all duration-200 border-b-2 -mb-px whitespace-nowrap
                    ${workflowId === wf.id
                      ? 'border-accent text-accent'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary hover:border-border-strong'
                    }`}
                >
                  {wf.name}
                </Link>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="input-field pl-8 pr-3 py-1.5 w-48 text-xs"
              />
            </div>

            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="input-field w-auto px-2.5 py-1.5 text-xs"
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button
              onClick={() => setAssignedToMe(v => !v)}
              className={`px-3 py-1.5 text-xs font-display rounded-lg border transition-all duration-200 ${
                assignedToMe
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:border-border-strong'
              }`}
            >
              My tasks
            </button>

            {assignedToMe && (
              <input
                type="text"
                value={agentId}
                onChange={e => saveAgentId(e.target.value)}
                placeholder="your agent ID / name…"
                className="input-field w-48 px-2.5 py-1.5 text-xs font-mono"
              />
            )}

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setAssignedToMe(false); setPriority('') }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="px-8 pb-8">
          {workflows.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-text-secondary mb-3">No workflows yet.</p>
              <Link href="/workflows/new" className="text-accent hover:underline text-sm">
                Create your first workflow
              </Link>
            </div>
          ) : workflowId ? (
            <KanbanBoard
              workflowId={workflowId}
              filterSearch={search}
              filterAssignedTo={assignedToMe ? agentId : ''}
              filterPriority={priority !== '' ? Number(priority) : undefined}
            />
          ) : projectId && visibleWorkflows.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-text-secondary mb-3">No workflows in this project yet.</p>
              <Link href={`/workflows/new?projectId=${projectId}`} className="text-accent hover:underline text-sm">
                Create a workflow →
              </Link>
            </div>
          ) : (
            <div className="flex gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-[272px] h-32 bg-surface-2 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default function TasksPage() {
  return (
    <div className="flex h-full">
      <Suspense fallback={
        <>
          <Nav reviewCount={0} />
          <main className="flex-1 overflow-auto bg-surface-0">
            <div className="flex gap-4 p-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-[272px] h-64 bg-surface-2 rounded-lg animate-pulse" />
              ))}
            </div>
          </main>
        </>
      }>
        <TasksContent />
      </Suspense>
    </div>
  )
}
