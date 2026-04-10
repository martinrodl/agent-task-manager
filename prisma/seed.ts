import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean up
  await prisma.taskEvent.deleteMany()
  await prisma.task.deleteMany()
  await prisma.workflowTransition.deleteMany()
  await prisma.workflowState.deleteMany()
  await prisma.workflow.deleteMany()

  // ─── Workflow 1: Code Review ───────────────────────────────────────────
  const codeReview = await prisma.workflow.create({
    data: {
      name: 'Code Review Workflow',
      description: 'Standard workflow for agent-driven code tasks with human review.',
    },
  })

  const [backlog, assigned, inProgress, pendingReview, changesRequired, approved, done] =
    await Promise.all([
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'BACKLOG',           label: 'Backlog',             color: '#9CA3AF', isInitial: true,  sortOrder: 0 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'ASSIGNED',          label: 'Assigned to agent',   color: '#60A5FA', sortOrder: 1 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'IN_PROGRESS',       label: 'In progress',         color: '#F59E0B', sortOrder: 2 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'PENDING_REVIEW',    label: 'Pending review',      color: '#8B5CF6', isBlocking: true,  sortOrder: 3 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'CHANGES_REQUIRED',  label: 'Changes required',    color: '#EF4444', sortOrder: 4 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'APPROVED',          label: 'Approved',            color: '#10B981', sortOrder: 5 } }),
      prisma.workflowState.create({ data: { workflowId: codeReview.id, name: 'DONE',              label: 'Done',                color: '#6B7280', isTerminal: true,  sortOrder: 6 } }),
    ])

  await Promise.all([
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: backlog.id,          toStateId: assigned.id,        name: 'assign',           label: 'Assign to agent',      allowedRoles: ['orchestrator', 'human'] } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: assigned.id,         toStateId: inProgress.id,      name: 'start',            label: 'Start working',        allowedRoles: ['agent'] } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: inProgress.id,       toStateId: pendingReview.id,   name: 'submit_review',    label: 'Submit for review',    allowedRoles: ['agent'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: pendingReview.id,    toStateId: approved.id,        name: 'approve',          label: 'Approve',              allowedRoles: ['human'] } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: pendingReview.id,    toStateId: changesRequired.id, name: 'request_changes',  label: 'Request changes',      allowedRoles: ['human'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: changesRequired.id,  toStateId: inProgress.id,      name: 'resume',           label: 'Resume work',          allowedRoles: ['agent'] } }),
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: approved.id,         toStateId: done.id,            name: 'complete',         label: 'Mark as done',         allowedRoles: ['orchestrator', 'human'] } }),
    // Convenience: skip straight to in-progress
    prisma.workflowTransition.create({ data: { workflowId: codeReview.id, fromStateId: backlog.id,          toStateId: inProgress.id,      name: 'quick_start',      label: 'Quick start',          allowedRoles: ['orchestrator', 'human'] } }),
  ])

  // ─── Workflow 2: Research Task ─────────────────────────────────────────
  const research = await prisma.workflow.create({
    data: {
      name: 'Research Workflow',
      description: 'Lightweight workflow for research and analysis tasks.',
    },
  })

  const [rTodo, rDoing, rNeedsInput, rDone] = await Promise.all([
    prisma.workflowState.create({ data: { workflowId: research.id, name: 'TODO',        label: 'To do',       color: '#9CA3AF', isInitial: true, sortOrder: 0 } }),
    prisma.workflowState.create({ data: { workflowId: research.id, name: 'DOING',       label: 'In progress', color: '#F59E0B', sortOrder: 1 } }),
    prisma.workflowState.create({ data: { workflowId: research.id, name: 'NEEDS_INPUT', label: 'Needs input', color: '#8B5CF6', isBlocking: true, sortOrder: 2 } }),
    prisma.workflowState.create({ data: { workflowId: research.id, name: 'DONE',        label: 'Done',        color: '#10B981', isTerminal: true, sortOrder: 3 } }),
  ])

  await Promise.all([
    prisma.workflowTransition.create({ data: { workflowId: research.id, fromStateId: rTodo.id,       toStateId: rDoing.id,      name: 'start',         label: 'Start',           allowedRoles: ['agent', 'human', 'orchestrator'] } }),
    prisma.workflowTransition.create({ data: { workflowId: research.id, fromStateId: rDoing.id,      toStateId: rNeedsInput.id, name: 'request_input', label: 'Request input',   allowedRoles: ['agent'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: research.id, fromStateId: rNeedsInput.id, toStateId: rDoing.id,      name: 'provide_input', label: 'Provide input',   allowedRoles: ['human'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: research.id, fromStateId: rDoing.id,      toStateId: rDone.id,       name: 'complete',      label: 'Mark complete',   allowedRoles: ['agent', 'human', 'orchestrator'], requiresComment: true } }),
  ])

  // ─── Sample tasks ──────────────────────────────────────────────────────
  const t1 = await prisma.task.create({
    data: {
      workflowId: codeReview.id,
      stateId: inProgress.id,
      title: 'Implement OAuth2 login with Google',
      description: 'Add Google OAuth2 authentication to the FastAPI backend. Use authlib library.',
      context: { repo: 'github.com/org/project', branch: 'feature/oauth', ticket: 'PROJ-42' },
      assignedTo: 'claude-agent-01',
      priority: 2,
      createdBy: 'human',
    },
  })
  await prisma.taskEvent.createMany({
    data: [
      { taskId: t1.id, fromStateId: backlog.id,   toStateId: assigned.id,    actor: 'admin',           actorType: 'human',        metadata: { transitionName: 'assign' } },
      { taskId: t1.id, fromStateId: assigned.id,  toStateId: inProgress.id,  actor: 'claude-agent-01', actorType: 'agent',        metadata: { transitionName: 'start' } },
    ],
  })

  const t2 = await prisma.task.create({
    data: {
      workflowId: codeReview.id,
      stateId: pendingReview.id,
      title: 'Add rate limiting to all API endpoints',
      description: 'Implement per-IP and per-token rate limiting using Redis.',
      context: { repo: 'github.com/org/project', pr: 'https://github.com/org/project/pull/17' },
      assignedTo: 'claude-agent-02',
      priority: 1,
      createdBy: 'human',
      result: { summary: 'Implemented rate limiting with slowapi. Added tests. PR ready for review.', pr_url: 'https://github.com/org/project/pull/17' },
    },
  })
  await prisma.taskEvent.createMany({
    data: [
      { taskId: t2.id, fromStateId: backlog.id,      toStateId: assigned.id,      actor: 'orchestrator',    actorType: 'orchestrator', metadata: { transitionName: 'assign' } },
      { taskId: t2.id, fromStateId: assigned.id,     toStateId: inProgress.id,    actor: 'claude-agent-02', actorType: 'agent',        metadata: { transitionName: 'start' } },
      { taskId: t2.id, fromStateId: inProgress.id,   toStateId: pendingReview.id, actor: 'claude-agent-02', actorType: 'agent',        comment: 'Rate limiting implemented with slowapi. All tests pass. Please review PR #17.', metadata: { transitionName: 'submit_review' } },
    ],
  })

  await prisma.task.create({
    data: {
      workflowId: codeReview.id,
      stateId: backlog.id,
      title: 'Write integration tests for user service',
      description: 'Cover CRUD operations and edge cases for the user service.',
      context: { repo: 'github.com/org/project', coverage_target: '80%' },
      priority: 0,
      createdBy: 'human',
    },
  })

  await prisma.task.create({
    data: {
      workflowId: research.id,
      stateId: rDoing.id,
      title: 'Research best vector DB for semantic search',
      description: 'Compare Pinecone, Qdrant, Weaviate, and pgvector for our use case.',
      context: { deadline: '2026-04-15', requirements: ['self-hosted', 'Python SDK', 'metadata filtering'] },
      assignedTo: 'claude-agent-01',
      priority: 1,
      createdBy: 'orchestrator',
    },
  })

  // ─── Workflow 3: AgentTask Development ────────────────────────────────
  // This workflow is used to develop AgentTask itself using AgentTask.
  // Claude Code (via MCP) picks up tasks from the backlog, implements them,
  // and submits for human review before merging.
  const devWorkflow = await prisma.workflow.create({
    data: {
      name: 'AgentTask Development',
      description: 'Self-management workflow — use this to build AgentTask with AgentTask. Claude Code picks tasks, implements them, and submits a PR for review.',
    },
  })

  const [dBacklog, dPlanning, dInProgress, dReview, dChanges, dApproved, dDone, dWontFix] =
    await Promise.all([
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'BACKLOG',          label: 'Backlog',           color: '#9CA3AF', isInitial: true, sortOrder: 0 } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'PLANNING',         label: 'Planning',          color: '#60A5FA', sortOrder: 1,
        stateInstructions: 'Read the task carefully. Think through the implementation approach, identify which files need to change, and write a short plan as your comment. Then transition to in_progress.' } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'IN_PROGRESS',      label: 'In progress',       color: '#F59E0B', sortOrder: 2,
        stateInstructions: 'Implement the feature or fix. Follow the existing code style. Run the dev server mentally — check for TypeScript errors. When done, commit your changes and transition to submit_review with a summary of what you did and what to test.' } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'PENDING_REVIEW',   label: 'Pending review',    color: '#8B5CF6', isBlocking: true, sortOrder: 3 } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'CHANGES_REQUIRED', label: 'Changes required',  color: '#EF4444', sortOrder: 4,
        stateInstructions: 'Read the reviewer comment carefully. Address all requested changes. Then transition back to submit_review with a summary of what you changed.' } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'APPROVED',         label: 'Approved',          color: '#10B981', sortOrder: 5 } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'DONE',             label: 'Done',              color: '#6B7280', isTerminal: true, sortOrder: 6 } }),
      prisma.workflowState.create({ data: { workflowId: devWorkflow.id, name: 'WONT_FIX',         label: "Won't fix",         color: '#D1D5DB', isTerminal: true, sortOrder: 7 } }),
    ])

  await Promise.all([
    // Human/orchestrator routes
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dBacklog.id,    toStateId: dPlanning.id,    name: 'start_planning',   label: 'Start planning',      allowedRoles: ['human', 'agent', 'orchestrator'] } }),
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dBacklog.id,    toStateId: dWontFix.id,     name: 'close',            label: "Won't fix",           allowedRoles: ['human', 'orchestrator'] } }),
    // Agent routes
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dPlanning.id,   toStateId: dInProgress.id,  name: 'begin_impl',       label: 'Begin implementation', allowedRoles: ['agent', 'human', 'orchestrator'] } }),
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dInProgress.id, toStateId: dReview.id,      name: 'submit_review',    label: 'Submit for review',   allowedRoles: ['agent', 'human'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dChanges.id,    toStateId: dReview.id,      name: 'submit_review',    label: 'Resubmit for review', allowedRoles: ['agent', 'human'], requiresComment: true } }),
    // Human review routes
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dReview.id,     toStateId: dApproved.id,    name: 'approve',          label: 'Approve',             allowedRoles: ['human'] } }),
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dReview.id,     toStateId: dChanges.id,     name: 'request_changes',  label: 'Request changes',     allowedRoles: ['human'], requiresComment: true } }),
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dReview.id,     toStateId: dWontFix.id,     name: 'close',            label: "Won't fix",           allowedRoles: ['human'] } }),
    // Completion
    prisma.workflowTransition.create({ data: { workflowId: devWorkflow.id, fromStateId: dApproved.id,   toStateId: dDone.id,        name: 'merge',            label: 'Merge & close',       allowedRoles: ['human', 'orchestrator'] } }),
  ])

  // ─── Backlog tasks for AgentTask itself ───────────────────────────────
  const devTasks = [
    {
      title: 'Add task search and filter to the tasks page',
      description: 'The tasks page currently shows only a kanban board with no way to search or filter. Add a search input (filters by title), an "Only mine" toggle (filters by assignedTo = current agent/user), and a priority filter dropdown. The search should be client-side for speed. Keep the existing kanban board below the filters.',
      context: { file: 'src/app/tasks/page.tsx', component: 'KanbanBoard', priority: 'high' },
      priority: 2,
    },
    {
      title: 'Add drag & drop to Kanban board',
      description: 'Tasks on the kanban board should be draggable between columns. Use the HTML5 drag-and-drop API (no external library). When a card is dropped on a column, find the transition from the current state to the target state and call POST /api/v1/tasks/:id/transition. Show a visual drop target highlight while dragging. If no valid transition exists between the states, show an error toast and revert.',
      context: { file: 'src/components/kanban-board.tsx', api: 'POST /api/v1/tasks/:id/transition', priority: 'high' },
      priority: 2,
    },
    {
      title: 'Show agent processing state on kanban card',
      description: 'When an agent is invoked for a task there is no visual indication on the kanban board. Add a subtle pulsing animation or spinner badge on task cards that are in a state with an agentId configured and are not terminal. The card should show "⚙ Processing" while the agent works. Use SSE to update when done.',
      context: { file: 'src/components/kanban-board.tsx', sse: '/api/v1/stream/tasks', priority: 'medium' },
      priority: 1,
    },
    {
      title: 'Agent error reporting — store failures as TaskEvents',
      description: 'When agent-runner.ts fails (LLM call throws, JSON parse fails, or transition fails), the error is only logged to console. The task silently gets stuck. Fix: on any error, create a TaskEvent with actorType="agent", no state change, and the error message in the comment field. This makes failures visible in the task activity log in the UI. Also broadcast via SSE.',
      context: { file: 'src/lib/agent-runner.ts', related: 'src/lib/state-machine.ts', priority: 'high' },
      priority: 3,
    },
    {
      title: 'Per-agent API tokens stored in DB',
      description: 'Currently all agents share a single AGENT_API_KEY env var, making it impossible to distinguish which agent is calling the API (the X-Agent-Id header is self-reported and unverified). Add an "apiToken" field to the Agent model in Prisma. When an agent authenticates with a Bearer token, look it up in the agents table first. Fall back to the env var for backward compatibility. The agent name comes from the DB record (not the header). Update middleware.ts and auth.ts.',
      context: { files: ['prisma/schema.prisma', 'src/lib/auth.ts', 'src/middleware.ts'], priority: 'medium' },
      priority: 1,
    },
    {
      title: 'Workflow templates — one-click starter workflows',
      description: 'New users have to build workflows from scratch. Add a "Use template" flow on the /workflows/new page: show 4-5 pre-built templates (Code Review, Research, Content Pipeline, Bug Triage, Data Processing) as cards. Clicking one creates the workflow with states and transitions pre-configured. Templates defined in src/lib/workflow-templates.ts. Similar pattern to how skill-templates.ts works.',
      context: { file: 'src/app/workflows/new/page.tsx', related: 'src/lib/skill-templates.ts', priority: 'medium' },
      priority: 1,
    },
    {
      title: 'Task detail: auto-refresh when agent finishes',
      description: 'The task detail page currently only loads once (no polling, no SSE). If an agent is processing the task, the page shows stale state until manually refreshed. Connect to the SSE stream at /api/v1/stream/tasks and reload task data when a task_transitioned event arrives for this task ID. Show a "Processing…" indicator when the current state has an agentId.',
      context: { file: 'src/app/tasks/[id]/page.tsx', sse: '/api/v1/stream/tasks', priority: 'medium' },
      priority: 1,
    },
    {
      title: 'Subtask support — parent/child task relationship',
      description: 'The Task model has a parentId field but the UI does not expose it. On the task detail page, show a "Subtasks" section that lists child tasks (with their state badges) and an "Add subtask" button that opens the new task form pre-filled with the parent workflow and parentId. On the task list/kanban, show a "has subtasks" indicator on parent cards.',
      context: { model: 'Task.parentId already exists in schema', files: ['src/app/tasks/[id]/page.tsx', 'src/app/tasks/new/page.tsx'], priority: 'low' },
      priority: 0,
    },
  ]

  for (const t of devTasks) {
    const task = await prisma.task.create({
      data: {
        workflowId: devWorkflow.id,
        stateId: dBacklog.id,
        title: t.title,
        description: t.description,
        context: t.context,
        priority: t.priority,
        createdBy: 'human',
      },
    })
    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        toStateId: dBacklog.id,
        actor: 'admin',
        actorType: 'human',
        metadata: { action: 'created' },
      },
    })
  }

  console.log('✅ Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
