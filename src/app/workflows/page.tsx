import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function WorkflowsPage() {
  const [workflows, blocking] = await Promise.all([
    prisma.workflow.findMany({
      include: {
        states:      { orderBy: { sortOrder: 'asc' } },
        _count:      { select: { tasks: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.task.count({ where: { state: { isBlocking: true } } }),
  ])

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
            <Link
              href="/workflows/new"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New workflow
            </Link>
          </div>

          {workflows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-500 mb-4">No workflows yet.</p>
              <Link href="/workflows/new" className="text-blue-600 hover:underline text-sm">Create your first workflow</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {workflows.map(wf => (
                <Link key={wf.id} href={`/workflows/${wf.id}`} className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-gray-900">{wf.name}</h2>
                      {wf.description && <p className="text-sm text-gray-500 mt-0.5">{wf.description}</p>}
                    </div>
                    <span className="text-sm text-gray-500 shrink-0 ml-4">{wf._count.tasks} task{wf._count.tasks !== 1 ? 's' : ''}</span>
                  </div>

                  {/* State chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {wf.states.map(s => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                        style={{ borderColor: s.color, color: s.color }}
                      >
                        {s.isInitial && '▶ '}
                        {s.label}
                        {s.isBlocking && ' 🔒'}
                        {s.isTerminal && ' ✓'}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-gray-400 mt-3">Created {formatDate(wf.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
