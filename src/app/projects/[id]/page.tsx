import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectWorkflowManager } from './project-workflow-manager'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [project, allWorkflows, blocking] = await Promise.all([
    prisma.project.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        workflows: {
          include: {
            states: { orderBy: { sortOrder: 'asc' } },
            _count: { select: { tasks: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.workflow.findMany({
      where: { projectId: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.count({ where: { state: { isBlocking: true } } }),
  ])

  if (!project) notFound()

  const totalTasks = project.workflows.reduce((sum, wf) => sum + wf._count.tasks, 0)

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ backgroundColor: project.color }}
              >
                {project.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-600">Projects</Link>
                  <span className="text-gray-300">/</span>
                  <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                  <span className="text-sm font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{project.slug}</span>
                </div>
                {project.description && <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {project.workflows.length} workflow{project.workflows.length !== 1 ? 's' : ''} · {totalTasks} task{totalTasks !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/workflows/new?projectId=${project.id}`}
                className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + New workflow
              </Link>
            </div>
          </div>

          {/* Workflows */}
          {project.workflows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-500 mb-4">No workflows in this project yet.</p>
              <Link href={`/workflows/new?projectId=${project.id}`} className="text-blue-600 hover:underline text-sm">
                Create a workflow →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {project.workflows.map(wf => (
                <div key={wf.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Link href={`/workflows/${wf.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                          {wf.name}
                        </Link>
                        <Link
                          href={`/tasks?workflowId=${wf.id}`}
                          className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
                        >
                          {wf._count.tasks} task{wf._count.tasks !== 1 ? 's' : ''}
                        </Link>
                      </div>

                      {/* State chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
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
                      <p className="text-xs text-gray-400 mt-2">Created {formatDate(wf.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                      <Link href={`/tasks?workflowId=${wf.id}`} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                        Kanban
                      </Link>
                      <Link href={`/workflows/${wf.id}`} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unassigned workflows */}
          {allWorkflows.length > 0 && (
            <div className="mt-8">
              <ProjectWorkflowManager
                projectId={project.id}
                unassignedWorkflows={allWorkflows}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
