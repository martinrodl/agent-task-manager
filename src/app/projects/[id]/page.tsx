import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectWorkflowManager } from './project-workflow-manager'
import { DeleteProjectButton } from './delete-project-button'

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
                  <Link href="/projects" className="text-sm text-text-tertiary hover:text-text-secondary">Projects</Link>
                  <span className="text-text-tertiary">/</span>
                  <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
                  <span className="text-sm font-mono text-text-tertiary bg-surface-2 px-2 py-0.5 rounded">{project.slug}</span>
                </div>
                {project.description && <p className="text-sm text-text-secondary mt-0.5">{project.description}</p>}
                <p className="text-xs text-text-tertiary mt-1">
                  {project.workflows.length} workflow{project.workflows.length !== 1 ? 's' : ''} · {totalTasks} task{totalTasks !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/workflows/new?projectId=${project.id}`}
                className="px-3 py-2 bg-accent text-text-inverse text-sm font-medium rounded-lg hover:shadow-glow transition-colors"
              >
                + New workflow
              </Link>
              <DeleteProjectButton projectId={project.id} projectName={project.name} />
            </div>
          </div>

          {/* Workflows */}
          {project.workflows.length === 0 ? (
            <div className="bg-surface-1 rounded-xl border border-border p-12 text-center">
              <p className="text-text-secondary mb-4">No workflows in this project yet.</p>
              <Link href={`/workflows/new?projectId=${project.id}`} className="text-accent hover:underline text-sm">
                Create a workflow →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {project.workflows.map(wf => (
                <div key={wf.id} className="bg-surface-1 rounded-xl border border-border p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Link href={`/workflows/${wf.id}`} className="font-semibold text-text-primary hover:text-accent">
                          {wf.name}
                        </Link>
                        <Link
                          href={`/tasks?workflowId=${wf.id}`}
                          className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded hover:bg-surface-2 transition-colors"
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
                      <p className="text-xs text-text-tertiary mt-2">Created {formatDate(wf.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                      <Link href={`/tasks?workflowId=${wf.id}`} className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 border border-border rounded hover:bg-surface-2">
                        Kanban
                      </Link>
                      <Link href={`/workflows/${wf.id}`} className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 border border-border rounded hover:bg-surface-2">
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
