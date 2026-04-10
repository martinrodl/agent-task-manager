/**
 * Agent timeout watcher
 *
 * Runs a background interval every WATCHER_INTERVAL_MS (default 5 min).
 * Finds tasks where the most recent event is "processing_started" and is older
 * than AGENT_TIMEOUT_MS (default 15 min). Records an error TaskEvent so the
 * failure is visible in the UI.
 *
 * Started automatically as a singleton when first imported (happens when
 * agent-runner.ts is first executed in the server process).
 */

import { prisma } from './prisma'
import { emitTaskEvent } from './sse'

const AGENT_TIMEOUT_MS       = Number(process.env.AGENT_TIMEOUT_MS       ?? 15 * 60 * 1000) // 15 min
const WATCHER_INTERVAL_MS    = Number(process.env.WATCHER_INTERVAL_MS    ?? 5  * 60 * 1000) // 5 min

async function checkTimeouts(): Promise<number> {
  const cutoff = new Date(Date.now() - AGENT_TIMEOUT_MS)

  // Find tasks in non-terminal states that have an agentId on the current state
  // and whose most recent event was "processing_started" before the cutoff
  const stuckTasks = await prisma.task.findMany({
    where: {
      state: { isTerminal: false, agentId: { not: null } },
    },
    include: {
      state: true,
      events: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  let timedOut = 0

  for (const task of stuckTasks) {
    const lastEvent = task.events[0]
    if (!lastEvent) continue

    const meta = lastEvent.metadata as Record<string, unknown>
    if (meta?.action !== 'processing_started') continue
    if (lastEvent.createdAt > cutoff) continue

    // This task is stuck
    const agentName = task.state.agentId ?? 'agent'
    const minutesAgo = Math.round((Date.now() - lastEvent.createdAt.getTime()) / 60_000)
    console.warn(`[timeout-watcher] Task ${task.id} stuck for ${minutesAgo}min — recording timeout`)

    await prisma.taskEvent.create({
      data: {
        taskId:    task.id,
        actor:     agentName,
        actorType: 'agent',
        comment:   `⏱ Agent timeout: no response after ${minutesAgo} minutes. Task may need manual intervention.`,
        metadata:  { action: 'processing_timeout', minutesAgo },
      },
    }).catch(() => { /* best effort */ })

    emitTaskEvent({
      type:       'task_updated',
      taskId:     task.id,
      taskTitle:  task.title,
      actor:      agentName,
      actorType:  'agent',
      workflowId: task.workflowId,
    })

    timedOut++
  }

  return timedOut
}

// ─── Singleton startup ────────────────────────────────────────────────────────

let started = false

export function startTimeoutWatcher(): void {
  if (started) return
  started = true

  console.log(`[timeout-watcher] Started — checking every ${WATCHER_INTERVAL_MS / 60_000}min, timeout=${AGENT_TIMEOUT_MS / 60_000}min`)

  const run = () => {
    checkTimeouts().then(n => {
      if (n > 0) console.warn(`[timeout-watcher] Flagged ${n} timed-out task(s)`)
    }).catch(err => {
      console.error('[timeout-watcher] Error:', err)
    })
  }

  // Initial check after 1 min (give the server time to settle)
  setTimeout(run, 60_000)
  setInterval(run, WATCHER_INTERVAL_MS)
}

// ─── Manual trigger API ───────────────────────────────────────────────────────

export { checkTimeouts }
