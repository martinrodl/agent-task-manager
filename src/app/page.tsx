import { prisma } from '@/lib/prisma'
import { Nav } from '@/components/nav'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import {
  ListTodo,
  ShieldAlert,
  Workflow,
  Plus,
  ArrowRight,
  Activity,
} from 'lucide-react'

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
  const totalInStates = tasksByState.reduce((sum, s) => sum + s._count.tasks, 0)

  return (
    <div className="flex h-full">
      <Nav reviewCount={blocking} />
      <main className="flex-1 overflow-auto bg-surface-0">
        {/* Hero gradient */}
        <div className="relative">
          <div className="absolute inset-0 h-64 bg-gradient-to-b from-accent/[0.04] to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/[0.03] rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-8 pt-10 pb-8">
            {/* Header */}
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="font-display text-xs font-semibold text-text-tertiary uppercase tracking-[0.2em] mb-2">
                  Mission Control
                </p>
                <h1 className="font-display text-3xl font-bold text-text-primary tracking-tight">
                  Dashboard
                </h1>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/tasks/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-text-inverse text-sm font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow transition-all duration-200 active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  New task
                </Link>
                <Link
                  href="/review"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 text-text-primary text-sm font-display font-medium rounded-lg border border-border hover:border-border-strong transition-all duration-200"
                >
                  Review queue
                  {blocking > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold bg-err text-white">
                      {blocking}
                    </span>
                  )}
                </Link>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <HeroStat
                icon={ListTodo}
                label="Total Tasks"
                value={total}
                accent
              />
              <Link href="/review" className="group">
                <HeroStat
                  icon={ShieldAlert}
                  label="Awaiting Review"
                  value={blocking}
                  variant={blocking > 0 ? 'warn' : 'default'}
                />
              </Link>
              <Link href="/workflows" className="group">
                <HeroStat
                  icon={Workflow}
                  label="Workflows"
                  value={workflows}
                />
              </Link>
            </div>

            {/* Glow divider */}
            <div className="h-px w-full mb-8 opacity-30" style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

            {/* Two columns */}
            <div className="grid grid-cols-2 gap-6">
              {/* Tasks by state */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Activity className="w-4 h-4 text-accent" />
                  <h2 className="font-display text-sm font-semibold text-text-primary tracking-wide uppercase">
                    Tasks by State
                  </h2>
                </div>
                {tasksByState.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    No tasks yet.{' '}
                    <Link href="/tasks/new" className="text-accent hover:underline">Create one</Link>.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {tasksByState.map(s => {
                      const pct = totalInStates > 0 ? (s._count.tasks / totalInStates) * 100 : 0
                      return (
                        <div key={s.id} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full ring-2 ring-surface-1" style={{ backgroundColor: s.color }} />
                              <span className="text-sm text-text-primary">{s.label}</span>
                              {s.isBlocking && (
                                <span className="badge-warn text-[10px] py-0">HITL</span>
                              )}
                            </div>
                            <span className="font-display text-sm font-semibold text-text-primary">{s._count.tasks}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}40` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <h2 className="font-display text-sm font-semibold text-text-primary tracking-wide uppercase">
                      Live Activity
                    </h2>
                  </div>
                </div>
                {recentEvents.length === 0 ? (
                  <p className="text-sm text-text-secondary">No activity yet.</p>
                ) : (
                  <div className="space-y-0">
                    {recentEvents.map((e, i) => (
                      <div key={e.id} className="relative flex gap-3 py-2.5 group">
                        {/* Timeline line */}
                        {i < recentEvents.length - 1 && (
                          <div className="absolute left-[5px] top-8 bottom-0 w-px bg-border" />
                        )}
                        {/* Dot */}
                        <div className="relative mt-1.5 shrink-0">
                          <div
                            className="w-[11px] h-[11px] rounded-full border-2 border-surface-1"
                            style={{ backgroundColor: e.toState?.color || 'var(--text-tertiary)' }}
                          />
                        </div>
                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/tasks/${e.task.id}`}
                            className="text-sm text-text-primary font-medium truncate block hover:text-accent transition-colors"
                          >
                            {e.task.title}
                          </Link>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {e.fromState && (
                              <span className="text-xs text-text-tertiary">{e.fromState.label}</span>
                            )}
                            <ArrowRight className="w-3 h-3 text-text-tertiary" />
                            <span className="text-xs font-medium" style={{ color: e.toState?.color }}>
                              {e.toState?.label}
                            </span>
                            <span className="text-text-tertiary text-xs">·</span>
                            <span className="text-xs text-text-tertiary">{e.actorType}</span>
                            <span className="text-text-tertiary text-xs">·</span>
                            <span className="text-xs text-text-tertiary">{formatDate(e.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Hero Stat Card ──────────────────────────────────────

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
  variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  accent?: boolean
  variant?: 'default' | 'warn'
}) {
  const isWarn = variant === 'warn'
  return (
    <div className="card relative overflow-hidden p-5 group-hover:border-border-strong transition-all duration-200">
      {/* Background glow */}
      {accent && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/[0.06] rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      )}
      {isWarn && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-warn/[0.06] rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      )}

      <div className="relative flex items-start justify-between">
        <div>
          <p className="font-display text-[11px] font-semibold text-text-tertiary uppercase tracking-[0.15em] mb-2">
            {label}
          </p>
          <p className={`font-display text-3xl font-bold tracking-tight ${accent ? 'text-gradient' : isWarn ? 'text-warn' : 'text-text-primary'}`}>
            {value}
          </p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/10' : isWarn ? 'bg-warn/10' : 'bg-surface-3'}`}>
          <Icon className={`w-[18px] h-[18px] ${accent ? 'text-accent' : isWarn ? 'text-warn' : 'text-text-secondary'}`} />
        </div>
      </div>
    </div>
  )
}
