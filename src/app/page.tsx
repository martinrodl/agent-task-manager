import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate, priorityLabel, priorityColor } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [total, blocking, workflows, recentEvents] = await Promise.all([
    prisma.task.count(),
    prisma.task.count({ where: { state: { isBlocking: true } } }),
    prisma.workflow.count(),
    prisma.taskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        task: { select: { id: true, title: true } },
        fromState: { select: { label: true } },
        toState:   { select: { label: true, color: true, isBlocking: true } },
      },
    }),
  ])

  const tasksByState = await prisma.workflowState.findMany({
    select: {
      id: true, label: true, color: true, isBlocking: true,
      _count: { select: { tasks: true } },
    },
    where: { tasks: { some: {} } },
    orderBy: { sortOrder: 'asc' },
  })

  return { total, blocking, workflows, recentEvents, tasksByState }
}

export default async function DashboardPage() {
  const { total, blocking, workflows, recentEvents, tasksByState } = await getStats()

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Total tasks" value={total} color="blue" />
            <StatCard label="Awaiting review" value={blocking} color="purple" href="/review" />
            <StatCard label="Workflows" value={workflows} color="gray" href="/workflows" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Tasks by state */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Tasks by state</h2>
              {tasksByState.length === 0 ? (
                <p className="text-sm text-gray-500">No tasks yet. <Link href="/tasks/new" className="text-blue-600 hover:underline">Create one</Link>.</p>
              ) : (
                <div className="space-y-2">
                  {tasksByState.map(s => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-sm text-gray-700">{s.label}</span>
                        {s.isBlocking && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded">HITL</span>}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{s._count.tasks}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Recent activity</h2>
              {recentEvents.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentEvents.map(e => (
                    <div key={e.id} className="flex gap-3">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          <Link href={`/tasks/${e.task.id}`} className="font-medium hover:underline">{e.task.title}</Link>
                        </p>
                        <p className="text-xs text-gray-500">
                          {e.fromState?.label} → <span style={{ color: e.toState?.color }}>{e.toState?.label}</span>
                          {' · '}{e.actorType} · {formatDate(e.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-6 flex gap-3">
            <Link href="/tasks/new" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + New task
            </Link>
            <Link href="/review" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Review queue {blocking > 0 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-1.5 rounded-full">{blocking}</span>}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, color, href }: { label: string; value: number; color: string; href?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600', purple: 'text-purple-600', gray: 'text-gray-600',
  }
  const content = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color] ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
  return href ? <Link href={href} className="hover:shadow-md transition-shadow block">{content}</Link> : content
}
