import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import Link from 'next/link'

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
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
              <p className="text-sm text-gray-500 mt-0.5">Group workflows into namespaces for different teams or codebases</p>
            </div>
            <Link
              href="/projects/new"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New project
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-3xl mb-3">📁</p>
              <p className="text-gray-500 mb-4">No projects yet. Create one to group your workflows.</p>
              <Link href="/projects/new" className="text-blue-600 hover:underline text-sm">
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
                    className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-gray-900 truncate">{p.name}</h2>
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {p.slug}
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-sm text-gray-500 mt-0.5 truncate">{p.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                      <span>{p.workflows.length} workflow{p.workflows.length !== 1 ? 's' : ''}</span>
                      <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Workflow chips */}
                    {p.workflows.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {p.workflows.slice(0, 5).map(wf => (
                          <span key={wf.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {wf.name}
                          </span>
                        ))}
                        {p.workflows.length > 5 && (
                          <span className="text-xs text-gray-400">+{p.workflows.length - 5} more</span>
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
