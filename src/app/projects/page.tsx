import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import Link from 'next/link'
import { Plus, FolderKanban } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const [projects, blocking] = await Promise.all([
    prisma.project.findMany({
      include: {
        workflows: {
          include: { _count: { select: { tasks: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.task.count({ where: { state: { isBlocking: true } } }),
  ])

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto bg-surface-0">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Projects</h1>
              <p className="text-sm text-text-secondary mt-0.5">Group workflows into namespaces for different teams or codebases</p>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-text-inverse text-sm font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow transition-all duration-200 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New project
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="card p-12 text-center">
              <FolderKanban className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-text-secondary mb-4">No projects yet. Create one to group your workflows.</p>
              <Link href="/projects/new" className="text-accent hover:underline text-sm">
                Create your first project →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projects.map(p => {
                const taskCount = p.workflows.reduce((sum, wf) => sum + wf._count.tasks, 0)
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="block card-interactive p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white text-sm font-display font-bold"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="font-display font-semibold text-text-primary truncate">{p.name}</h2>
                          <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded shrink-0">
                            {p.slug}
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-sm text-text-secondary mt-0.5 truncate">{p.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-4 text-sm text-text-tertiary font-display">
                      <span>{p.workflows.length} workflow{p.workflows.length !== 1 ? 's' : ''}</span>
                      <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                    </div>

                    {p.workflows.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {p.workflows.slice(0, 5).map(wf => (
                          <span key={wf.id} className="text-[10px] font-display bg-surface-3 text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {wf.name}
                          </span>
                        ))}
                        {p.workflows.length > 5 && (
                          <span className="text-xs text-text-tertiary">+{p.workflows.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
