import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { WorkflowBuilder } from '@/components/workflow-builder'
import { KanbanBoard } from '@/components/kanban-board'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [workflow, blocking, agents] = await Promise.all([
    prisma.workflow.findUnique({
      where: { id },
      include: {
        states:      { orderBy: { sortOrder: 'asc' } },
        transitions: { include: { fromState: true, toState: true } },
        _count:      { select: { tasks: true } },
        project:     { select: { id: true, name: true } },
      },
    }),
    prisma.task.count({ where: { state: { isBlocking: true } } }),
    prisma.agent.findMany({ where: { enabled: true }, select: { id: true, name: true, description: true }, orderBy: { name: 'asc' } }),
  ])

  if (!workflow) notFound()

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {workflow.project ? (
                <>
                  <Link href="/projects" className="hover:text-gray-700">Projects</Link>
                  <span>/</span>
                  <Link href={`/projects/${workflow.project.id}`} className="hover:text-gray-700">{workflow.project.name}</Link>
                  <span>/</span>
                  <span className="text-gray-400">Workflows</span>
                </>
              ) : (
                <Link href="/workflows" className="hover:text-gray-700">← Workflows</Link>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{workflow.name}</h1>
                {workflow.description && <p className="text-sm text-gray-500 mt-0.5">{workflow.description}</p>}
              </div>
              <div className="flex gap-3">
                <Link
                  href={`/tasks/new?workflowId=${workflow.id}`}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  + New task
                </Link>
              </div>
            </div>
          </div>

          {/* Kanban */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Kanban ({workflow._count.tasks} tasks)</h2>
            <KanbanBoard workflowId={workflow.id} />
          </div>

          {/* Builder */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Configure workflow</h2>
            <WorkflowBuilder
              agents={agents}
              workflow={{
                id: workflow.id, name: workflow.name, description: workflow.description ?? '',
                projectId:     workflow.projectId,
                workspaceType: workflow.workspaceType,
                workspacePath: workflow.workspacePath,
                githubRepo:    workflow.githubRepo,
                githubBranch:  workflow.githubBranch,
                githubToken:   workflow.githubToken,
                webhookUrl:    workflow.webhookUrl,
                webhookSecret: workflow.webhookSecret,
                sandboxMode:   workflow.sandboxMode,
                dockerImage:   workflow.dockerImage,
                gitCloneUrl:   workflow.gitCloneUrl,
                setupScript:   workflow.setupScript,
              }}
              initialStates={workflow.states.map(s => ({
                id: s.id, name: s.name, label: s.label, color: s.color,
                isInitial: s.isInitial, isTerminal: s.isTerminal, isBlocking: s.isBlocking,
                sortOrder: s.sortOrder,
                agentId:                 s.agentId,
                completionTransitionName: s.completionTransitionName,
                stateInstructions:       s.stateInstructions,
              }))}
              initialTransitions={workflow.transitions.map(t => ({
                id:             t.id,
                fromStateId:    t.fromStateId,
                toStateId:      t.toStateId,
                name:           t.name,
                label:          t.label,
                allowedRoles:   t.allowedRoles,
                requiresComment: t.requiresComment,
              }))}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
