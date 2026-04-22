import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Workflow } from 'lucide-react'

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
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Workflows</h1>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow transition-all duration-200 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New workflow
            </Link>
          </div>

          {workflows.length === 0 ? (
            <div className="card p-12 text-center">
              <Workflow className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-text-secondary mb-4">No workflows yet.</p>
              <Link href="/workflows/new" className="text-accent hover:underline text-sm">Create your first workflow</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {workflows.map(wf => (
                <Link key={wf.id} href={`/workflows/${wf.id}`} className="block card-interactive p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-display font-semibold text-text-primary">{wf.name}</h2>
                      {wf.description && <p className="text-sm text-text-secondary mt-0.5">{wf.description}</p>}
                    </div>
                    <span className="text-sm text-text-tertiary shrink-0 ml-4 font-display">{wf._count.tasks} task{wf._count.tasks !== 1 ? 's' : ''}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {wf.states.map(s => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 text-[10px] font-display px-2 py-0.5 rounded-full border uppercase tracking-wider"
                        style={{ borderColor: s.color + '60', color: s.color }}
                      >
                        {s.isInitial && '▶ '}
                        {s.label}
                        {s.isBlocking && ' ◆'}
                        {s.isTerminal && ' ✓'}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-text-tertiary mt-3">Created {formatDate(wf.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
