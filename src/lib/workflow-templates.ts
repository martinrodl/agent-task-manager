export interface WorkflowStateTemplate {
  name: string
  label: string
  color: string
  isInitial?: boolean
  isTerminal?: boolean
  isBlocking?: boolean
  sortOrder: number
  stateInstructions?: string
}

export interface WorkflowTransitionTemplate {
  fromStateName: string
  toStateName: string
  name: string
  label: string
  allowedRoles: string[]
  requiresComment?: boolean
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  tags: string[]
  states: WorkflowStateTemplate[]
  transitions: WorkflowTransitionTemplate[]
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── 1. Code Review ────────────────────────────────────────────────────────
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Agent implements features or fixes, human reviews and approves before merging.',
    icon: '💻',
    tags: ['engineering', 'popular'],
    states: [
      { name: 'BACKLOG',          label: 'Backlog',           color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'IN_PROGRESS',      label: 'In progress',       color: '#F59E0B', sortOrder: 1,
        stateInstructions: 'Implement the requested feature or fix. When done, transition to submit_review with a clear summary of what you changed and how to test it.' },
      { name: 'PENDING_REVIEW',   label: 'Pending review',    color: '#8B5CF6', isBlocking: true, sortOrder: 2 },
      { name: 'CHANGES_REQUIRED', label: 'Changes required',  color: '#EF4444', sortOrder: 3,
        stateInstructions: 'Address all reviewer comments. Transition back to submit_review when done.' },
      { name: 'APPROVED',         label: 'Approved',          color: '#10B981', sortOrder: 4 },
      { name: 'DONE',             label: 'Done',              color: '#6B7280', isTerminal: true, sortOrder: 5 },
    ],
    transitions: [
      { fromStateName: 'BACKLOG',          toStateName: 'IN_PROGRESS',      name: 'start',           label: 'Start',             allowedRoles: ['human', 'orchestrator', 'agent'] },
      { fromStateName: 'IN_PROGRESS',      toStateName: 'PENDING_REVIEW',   name: 'submit_review',   label: 'Submit for review', allowedRoles: ['agent', 'human'], requiresComment: true },
      { fromStateName: 'PENDING_REVIEW',   toStateName: 'APPROVED',         name: 'approve',         label: 'Approve',           allowedRoles: ['human'] },
      { fromStateName: 'PENDING_REVIEW',   toStateName: 'CHANGES_REQUIRED', name: 'request_changes', label: 'Request changes',   allowedRoles: ['human'], requiresComment: true },
      { fromStateName: 'CHANGES_REQUIRED', toStateName: 'PENDING_REVIEW',   name: 'submit_review',   label: 'Resubmit',          allowedRoles: ['agent', 'human'], requiresComment: true },
      { fromStateName: 'APPROVED',         toStateName: 'DONE',             name: 'complete',        label: 'Mark done',         allowedRoles: ['human', 'orchestrator'] },
    ],
  },

  // ─── 2. Research ───────────────────────────────────────────────────────────
  {
    id: 'research',
    name: 'Research & Analysis',
    description: 'Lightweight workflow for research, analysis, and report generation tasks.',
    icon: '🔬',
    tags: ['research', 'popular'],
    states: [
      { name: 'TODO',        label: 'To do',       color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'IN_PROGRESS', label: 'In progress', color: '#F59E0B', sortOrder: 1,
        stateInstructions: 'Research the topic thoroughly. Use available tools and skills. When done, write a structured summary and transition to complete.' },
      { name: 'NEEDS_INPUT', label: 'Needs input', color: '#8B5CF6', isBlocking: true, sortOrder: 2 },
      { name: 'DONE',        label: 'Done',        color: '#10B981', isTerminal: true, sortOrder: 3 },
    ],
    transitions: [
      { fromStateName: 'TODO',        toStateName: 'IN_PROGRESS', name: 'start',         label: 'Start',          allowedRoles: ['agent', 'human', 'orchestrator'] },
      { fromStateName: 'IN_PROGRESS', toStateName: 'NEEDS_INPUT', name: 'request_input', label: 'Request input',  allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'NEEDS_INPUT', toStateName: 'IN_PROGRESS', name: 'provide_input', label: 'Provide input',  allowedRoles: ['human'], requiresComment: true },
      { fromStateName: 'IN_PROGRESS', toStateName: 'DONE',        name: 'complete',      label: 'Mark complete',  allowedRoles: ['agent', 'human', 'orchestrator'], requiresComment: true },
    ],
  },

  // ─── 3. Bug Triage ─────────────────────────────────────────────────────────
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    description: 'Report a bug → agent reproduces and classifies → human confirms priority → agent fixes.',
    icon: '🐛',
    tags: ['engineering'],
    states: [
      { name: 'REPORTED',    label: 'Reported',      color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'TRIAGING',    label: 'Triaging',      color: '#60A5FA', sortOrder: 1,
        stateInstructions: 'Try to reproduce the bug. Identify the root cause if possible. Classify severity (critical/high/medium/low) and add your findings as a comment. Transition to awaiting_priority.' },
      { name: 'AWAITING_PRIORITY', label: 'Awaiting priority', color: '#8B5CF6', isBlocking: true, sortOrder: 2 },
      { name: 'IN_PROGRESS', label: 'Fixing',         color: '#F59E0B', sortOrder: 3,
        stateInstructions: 'Fix the bug. Write a regression test if possible. Transition to fixed when done.' },
      { name: 'FIXED',       label: 'Fixed',          color: '#10B981', sortOrder: 4 },
      { name: 'CLOSED',      label: 'Closed',         color: '#6B7280', isTerminal: true, sortOrder: 5 },
      { name: 'WONT_FIX',   label: "Won't fix",      color: '#D1D5DB', isTerminal: true, sortOrder: 6 },
    ],
    transitions: [
      { fromStateName: 'REPORTED',         toStateName: 'TRIAGING',          name: 'triage',          label: 'Start triage',     allowedRoles: ['agent', 'human', 'orchestrator'] },
      { fromStateName: 'TRIAGING',         toStateName: 'AWAITING_PRIORITY', name: 'await_priority',  label: 'Needs prioritization', allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'AWAITING_PRIORITY',toStateName: 'IN_PROGRESS',       name: 'prioritize',      label: 'Prioritize & assign', allowedRoles: ['human'] },
      { fromStateName: 'AWAITING_PRIORITY',toStateName: 'WONT_FIX',          name: 'close',           label: "Won't fix",        allowedRoles: ['human'] },
      { fromStateName: 'IN_PROGRESS',      toStateName: 'FIXED',             name: 'mark_fixed',      label: 'Mark fixed',       allowedRoles: ['agent', 'human'], requiresComment: true },
      { fromStateName: 'FIXED',            toStateName: 'CLOSED',            name: 'close',           label: 'Close',            allowedRoles: ['human', 'orchestrator'] },
      { fromStateName: 'FIXED',            toStateName: 'IN_PROGRESS',       name: 'reopen',          label: 'Reopen',           allowedRoles: ['human'] },
    ],
  },

  // ─── 4. Content Pipeline ───────────────────────────────────────────────────
  {
    id: 'content-pipeline',
    name: 'Content Pipeline',
    description: 'Draft → edit → human review → publish. Great for blog posts, docs, and marketing copy.',
    icon: '✍️',
    tags: ['content', 'marketing'],
    states: [
      { name: 'BRIEF',      label: 'Brief',        color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'DRAFTING',   label: 'Drafting',     color: '#60A5FA', sortOrder: 1,
        stateInstructions: 'Write the first draft based on the brief. Aim for the requested tone, length, and audience. Transition to review when draft is ready.' },
      { name: 'EDITING',    label: 'Editing',      color: '#F59E0B', sortOrder: 2,
        stateInstructions: 'Edit for clarity, grammar, and style. Address any feedback from the previous review if present. Transition to review when done.' },
      { name: 'REVIEW',     label: 'Human review', color: '#8B5CF6', isBlocking: true, sortOrder: 3 },
      { name: 'PUBLISHED',  label: 'Published',    color: '#10B981', isTerminal: true, sortOrder: 4 },
      { name: 'REJECTED',   label: 'Rejected',     color: '#EF4444', isTerminal: true, sortOrder: 5 },
    ],
    transitions: [
      { fromStateName: 'BRIEF',     toStateName: 'DRAFTING',  name: 'start_draft',     label: 'Start drafting',  allowedRoles: ['agent', 'human', 'orchestrator'] },
      { fromStateName: 'DRAFTING',  toStateName: 'REVIEW',    name: 'submit_review',   label: 'Submit for review', allowedRoles: ['agent', 'human'], requiresComment: true },
      { fromStateName: 'DRAFTING',  toStateName: 'EDITING',   name: 'edit',            label: 'Send to editing', allowedRoles: ['agent', 'human'] },
      { fromStateName: 'EDITING',   toStateName: 'REVIEW',    name: 'submit_review',   label: 'Submit for review', allowedRoles: ['agent', 'human'], requiresComment: true },
      { fromStateName: 'REVIEW',    toStateName: 'PUBLISHED', name: 'publish',         label: 'Approve & publish', allowedRoles: ['human'] },
      { fromStateName: 'REVIEW',    toStateName: 'EDITING',   name: 'request_edits',   label: 'Request edits',   allowedRoles: ['human'], requiresComment: true },
      { fromStateName: 'REVIEW',    toStateName: 'REJECTED',  name: 'reject',          label: 'Reject',          allowedRoles: ['human'], requiresComment: true },
    ],
  },

  // ─── 5. Data Processing ────────────────────────────────────────────────────
  {
    id: 'data-processing',
    name: 'Data Processing',
    description: 'ETL / data pipeline workflow. Agent processes data, validates results, human approves output.',
    icon: '📊',
    tags: ['data', 'automation'],
    states: [
      { name: 'QUEUED',     label: 'Queued',       color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'PROCESSING', label: 'Processing',   color: '#F59E0B', sortOrder: 1,
        stateInstructions: 'Process the data according to the task description. Store structured results in the result field. If validation fails, transition to failed with error details.' },
      { name: 'VALIDATING', label: 'Validating',   color: '#60A5FA', sortOrder: 2,
        stateInstructions: 'Validate the processed data for completeness and correctness. If valid, transition to review. If invalid, transition to failed.' },
      { name: 'REVIEW',     label: 'Review',       color: '#8B5CF6', isBlocking: true, sortOrder: 3 },
      { name: 'DONE',       label: 'Done',         color: '#10B981', isTerminal: true, sortOrder: 4 },
      { name: 'FAILED',     label: 'Failed',       color: '#EF4444', isTerminal: true, sortOrder: 5 },
    ],
    transitions: [
      { fromStateName: 'QUEUED',     toStateName: 'PROCESSING', name: 'start',    label: 'Start processing', allowedRoles: ['agent', 'orchestrator'] },
      { fromStateName: 'PROCESSING', toStateName: 'VALIDATING', name: 'validate', label: 'Validate',         allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'PROCESSING', toStateName: 'FAILED',     name: 'fail',     label: 'Mark failed',      allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'VALIDATING', toStateName: 'REVIEW',     name: 'review',   label: 'Send to review',   allowedRoles: ['agent'] },
      { fromStateName: 'VALIDATING', toStateName: 'FAILED',     name: 'fail',     label: 'Mark failed',      allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'REVIEW',     toStateName: 'DONE',       name: 'approve',  label: 'Approve',          allowedRoles: ['human'] },
      { fromStateName: 'REVIEW',     toStateName: 'QUEUED',     name: 'reprocess',label: 'Reprocess',        allowedRoles: ['human'], requiresComment: true },
    ],
  },

  // ─── 6. Simple Automation ──────────────────────────────────────────────────
  {
    id: 'simple-automation',
    name: 'Simple Automation',
    description: 'Fully automated — agent handles everything start to finish, no human review needed.',
    icon: '⚡',
    tags: ['automation', 'simple'],
    states: [
      { name: 'PENDING',  label: 'Pending',    color: '#9CA3AF', isInitial: true, sortOrder: 0 },
      { name: 'RUNNING',  label: 'Running',    color: '#F59E0B', sortOrder: 1,
        stateInstructions: 'Complete the task autonomously. Store results in the result field and transition to done when finished, or to failed on error.' },
      { name: 'DONE',     label: 'Done',       color: '#10B981', isTerminal: true, sortOrder: 2 },
      { name: 'FAILED',   label: 'Failed',     color: '#EF4444', isTerminal: true, sortOrder: 3 },
    ],
    transitions: [
      { fromStateName: 'PENDING', toStateName: 'RUNNING', name: 'start', label: 'Start',       allowedRoles: ['agent', 'orchestrator', 'human'] },
      { fromStateName: 'RUNNING', toStateName: 'DONE',    name: 'done',  label: 'Mark done',   allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'RUNNING', toStateName: 'FAILED',  name: 'fail',  label: 'Mark failed', allowedRoles: ['agent'], requiresComment: true },
      { fromStateName: 'FAILED',  toStateName: 'PENDING', name: 'retry', label: 'Retry',       allowedRoles: ['human', 'orchestrator'] },
    ],
  },
]

export const TEMPLATE_TAGS = ['popular', 'engineering', 'research', 'content', 'marketing', 'data', 'automation', 'simple'] as const
