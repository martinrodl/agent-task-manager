'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { KanbanBoard } from '@/components/kanban-board'
import { fetchJSON } from '@/lib/fetch'

interface Workflow { id: string; name: string }

function TasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [loaded, setLoaded] = useState(false)

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
          <div className="flex items-center justify-between mb-5">
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
            <div className="flex gap-0 mb-6 border-b border-gray-200">
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
            <KanbanBoard workflowId={workflowId} />
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
