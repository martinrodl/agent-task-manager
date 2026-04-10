'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { KanbanBoard } from '@/components/kanban-board'
import { fetchJSON } from '@/lib/fetch'

interface Workflow { id: string; name: string }

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
  const [reviewCount, setReviewCount] = useState(0)
  const [loaded, setLoaded]         = useState(false)

  // Filters
  const [search, setSearch]         = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [priority, setPriority]     = useState('')
  const [agentId, setAgentId]       = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('agentId') ?? '' : ''
  )

  const workflowId = searchParams.get('workflowId') ?? ''

  useEffect(() => {
    Promise.all([
      fetchJSON<Workflow[] | { data: Workflow[] }>('/api/v1/workflows', []),
      fetchJSON<{ total: number }>('/api/v1/tasks?blocking=true&limit=0', { total: 0 }),
    ]).then(([wfs, bt]) => {
      const list: Workflow[] = Array.isArray(wfs) ? wfs : (wfs.data ?? [])
      setWorkflows(list)
      setReviewCount(bt.total ?? 0)
      setLoaded(true)
      if (!searchParams.get('workflowId') && list.length > 0) {
        router.replace(`/tasks?workflowId=${list[0].id}`)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function saveAgentId(v: string) {
    setAgentId(v)
    if (typeof window !== 'undefined') localStorage.setItem('agentId', v)
  }

  const hasFilters = search || assignedToMe || priority

  if (!loaded) {
    return (
      <main className="flex-1 overflow-auto">
        <div className="flex gap-4 p-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-[272px] h-64 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </main>
    )
  }

  const activeWorkflow = workflows.find(w => w.id === workflowId)

  return (
    <>
      <Nav reviewCount={reviewCount} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 pt-6 pb-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">
              {activeWorkflow ? activeWorkflow.name : 'Tasks'}
            </h1>
            <Link
              href={workflowId ? `/tasks/new?workflowId=${workflowId}` : '/tasks/new'}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New task
            </Link>
          </div>

          {/* Workflow tabs */}
          {workflows.length > 1 && (
            <div className="flex gap-0 mb-4 border-b border-gray-200">
              {workflows.map(wf => (
                <Link
                  key={wf.id}
                  href={`/tasks?workflowId=${wf.id}`}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap
                    ${workflowId === wf.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  {wf.name}
                </Link>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>

            {/* Priority filter */}
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* My tasks toggle */}
            <button
              onClick={() => setAssignedToMe(v => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                assignedToMe
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              My tasks
            </button>

            {/* Agent ID input — shown when "My tasks" active */}
            {assignedToMe && (
              <input
                type="text"
                value={agentId}
                onChange={e => saveAgentId(e.target.value)}
                placeholder="your agent ID / name…"
                className="px-2.5 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono w-48"
              />
            )}

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setAssignedToMe(false); setPriority('') }}
                className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="px-8 pb-8">
          {workflows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-500 mb-3">No workflows yet.</p>
              <Link href="/workflows/new" className="text-blue-600 hover:underline text-sm">
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
          ) : (
            <div className="flex gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-[272px] h-32 bg-gray-100 rounded-lg animate-pulse" />
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
          <main className="flex-1 overflow-auto">
            <div className="flex gap-4 p-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-[272px] h-64 bg-gray-100 rounded-lg animate-pulse" />
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
