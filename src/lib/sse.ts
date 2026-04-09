import { EventEmitter } from 'events'

export interface TaskEventPayload {
  type: string
  taskId: string
  taskTitle: string
  fromState?: string
  toState?: string
  isBlocking?: boolean
  actor: string
  actorType: string
  workflowId: string
}

// Global in-process emitter — works for single-pod MVP.
// For multi-pod replace with Redis Pub/Sub.
class TaskSSEEmitter extends EventEmitter {}
export const taskEmitter = new TaskSSEEmitter()
taskEmitter.setMaxListeners(500)

export function emitTaskEvent(payload: TaskEventPayload) {
  taskEmitter.emit('task', payload)
}
