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

  console.log('✅ Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
