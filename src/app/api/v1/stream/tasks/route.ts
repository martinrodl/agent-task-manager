import { NextRequest } from 'next/server'
import { taskEmitter, type TaskEventPayload } from '@/lib/sse'
import { resolveActor } from '@/lib/auth'

// GET /api/v1/stream/tasks   — Server-Sent Events
export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })

  const workflowId = req.nextUrl.searchParams.get('workflowId') ?? null

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat every 25s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 25_000)

      const listener = (payload: TaskEventPayload) => {
        if (workflowId && payload.workflowId !== workflowId) return
        try {
          const eventName = payload.type ?? 'task_updated'
          const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch {
          // client disconnected
        }
      }

      taskEmitter.on('task', listener)

      // Initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`)
      )

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        taskEmitter.off('task', listener)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}
