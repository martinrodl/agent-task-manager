import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth'
import { checkTimeouts } from '@/lib/timeout-watcher'

// POST /api/v1/admin/check-timeouts
// Manually trigger a timeout scan — useful for testing or external cron invocation.
// curl -X POST http://localhost:3000/api/v1/admin/check-timeouts -H "Authorization: Bearer $ORCHESTRATOR_API_KEY"
export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType === 'agent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const timedOut = await checkTimeouts()
  return NextResponse.json({ ok: true, timedOutTasks: timedOut })
}
