#!/usr/bin/env node
/**
 * AgentTask MCP Server
 *
 * Exposes AgentTask as tools for Claude Code (or any MCP client).
 * Claude Code can then list tasks, read details, execute transitions, and add comments.
 *
 * Configuration (env vars):
 *   AGENTTASK_URL=http://localhost:3000          (default)
 *   AGENTTASK_API_KEY=agent-key-change-me        (from .env AGENT_API_KEY)
 *   AGENTTASK_AGENT_ID=claude-code               (how this agent identifies itself)
 *
 * Setup:
 *   cd apps/agenttask/mcp-server && npm install
 *   claude mcp add agenttask \
 *     -e AGENTTASK_URL=http://localhost:3000 \
 *     -e AGENTTASK_API_KEY=<your-key> \
 *     -e AGENTTASK_AGENT_ID=claude-code \
 *     -- npx tsx /absolute/path/to/mcp-server/index.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BASE_URL  = (process.env.AGENTTASK_URL     ?? 'http://localhost:3000').replace(/\/$/, '')
const API_KEY   =  process.env.AGENTTASK_API_KEY  ?? ''
const AGENT_ID  =  process.env.AGENTTASK_AGENT_ID ?? 'claude-code'

if (!API_KEY) {
  process.stderr.write('[agenttask-mcp] WARNING: AGENTTASK_API_KEY is not set — requests will be rejected\n')
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-Agent-Id': AGENT_ID,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!text) return null
  const data = JSON.parse(text)
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data
}

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'agenttask', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_tasks',
      description:
        'List tasks from AgentTask. Returns each task with its current state and a link to available transitions. ' +
        'Use this to find work that needs to be done.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Filter by workflow ID (from list_workflows)' },
          assignedTo: { type: 'string', description: 'Filter by assignee (agent name or "me")' },
          blocking:   { type: 'boolean', description: 'Only tasks requiring human review/approval' },
          limit:      { type: 'number',  description: 'Max results — default 20, max 50' },
          offset:     { type: 'number',  description: 'Pagination offset' },
        },
      },
    },
    {
      name: 'get_task',
      description:
        'Get full task details: title, description, context JSON, current state, event history, ' +
        'and the list of available transitions you can call next. Always call this before transitioning.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'transition_task',
      description:
        'Execute a state transition on a task — e.g. mark it done, send for review, reject it, etc. ' +
        'Use get_task first to see which transitionNames are available. ' +
        'Always include a comment explaining what you did.',
      inputSchema: {
        type: 'object',
        properties: {
          id:             { type: 'string', description: 'Task ID' },
          transitionName: { type: 'string', description: 'Name of the transition (from get_task _links.availableTransitions)' },
          comment:        { type: 'string', description: 'Summary of work done or reason for the transition' },
          result:         { type: 'object', description: 'Any structured output to persist on the task (arbitrary JSON)' },
        },
        required: ['id', 'transitionName'],
      },
    },
    {
      name: 'add_comment',
      description: 'Add a comment to a task without changing its state. Useful for progress updates.',
      inputSchema: {
        type: 'object',
        properties: {
          id:      { type: 'string', description: 'Task ID' },
          comment: { type: 'string', description: 'Comment text (Markdown supported)' },
        },
        required: ['id', 'comment'],
      },
    },
    {
      name: 'create_task',
      description: 'Create a new task in a workflow. The task starts in the workflow\'s initial state.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId:  { type: 'string', description: 'Workflow ID (from list_workflows)' },
          title:       { type: 'string', description: 'Short task title' },
          description: { type: 'string', description: 'Detailed description (Markdown)' },
          assignedTo:  { type: 'string', description: 'Agent or user to assign to' },
          priority:    { type: 'number', description: '0=Low, 1=Medium, 2=High, 3=Critical' },
          context:     { type: 'object', description: 'Structured metadata/input for the agent (any JSON)' },
        },
        required: ['workflowId', 'title'],
      },
    },
    {
      name: 'list_workflows',
      description: 'List all available workflows with their states. Use to find valid workflowId values for create_task.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_workflow',
      description:
        'Create a complete workflow — name, states, and transitions — in a single call. ' +
        'Use this when the user asks you to design or generate a new workflow. ' +
        'States are created in the order provided; the first state marked isInitial becomes the entry point. ' +
        'Transitions wire states together; reference states by their name field (case-insensitive).',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Workflow name, e.g. "Code Review" or "Bug Triage"',
          },
          description: {
            type: 'string',
            description: 'Short description of what this workflow is for',
          },
          states: {
            type: 'array',
            description: 'Ordered list of states (columns on the kanban board)',
            items: {
              type: 'object',
              properties: {
                name:                    { type: 'string',  description: 'Machine name — uppercase, underscores, e.g. PENDING_REVIEW' },
                label:                   { type: 'string',  description: 'Human-readable label, e.g. "Pending Review"' },
                color:                   { type: 'string',  description: 'Hex colour, e.g. "#60A5FA"' },
                isInitial:               { type: 'boolean', description: 'True for the entry state (exactly one)' },
                isTerminal:              { type: 'boolean', description: 'True for end states — no further transitions allowed' },
                isBlocking:              { type: 'boolean', description: 'True for human-in-the-loop checkpoints — task waits for human action' },
                sortOrder:               { type: 'number',  description: 'Column order on kanban (0-based, auto-assigned if omitted)' },
                agentId:                 { type: 'string',  description: 'Name of the agent auto-invoked when a task enters this state' },
                completionTransitionName: { type: 'string', description: 'Transition the agent calls when done, e.g. "complete"' },
                stateInstructions:       { type: 'string',  description: 'Extra instructions injected into the agent prompt for this state' },
              },
              required: ['name', 'label'],
            },
          },
          transitions: {
            type: 'array',
            description: 'Edges between states',
            items: {
              type: 'object',
              properties: {
                fromStateName:   { type: 'string',  description: 'Source state name (matches states[].name)' },
                toStateName:     { type: 'string',  description: 'Target state name' },
                name:            { type: 'string',  description: 'Machine name, e.g. "submit_review"' },
                label:           { type: 'string',  description: 'Human label, e.g. "Submit for review"' },
                allowedRoles:    { type: 'array', items: { type: 'string' }, description: 'Who can trigger this: "human", "agent", "orchestrator"' },
                requiresComment: { type: 'boolean', description: 'Whether a comment is mandatory when triggering this transition' },
              },
              required: ['fromStateName', 'toStateName', 'name', 'label'],
            },
          },
        },
        required: ['name', 'states'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  try {
    let data: unknown

    switch (name) {
      case 'list_tasks': {
        const p = new URLSearchParams()
        if (args.workflowId) p.set('workflowId', String(args.workflowId))
        if (args.assignedTo === 'me') p.set('assignedTo', AGENT_ID)
        else if (args.assignedTo)     p.set('assignedTo', String(args.assignedTo))
        if (args.blocking)  p.set('blocking', 'true')
        p.set('limit',  String(Math.min(Number(args.limit  ?? 20), 50)))
        p.set('offset', String(Number(args.offset ?? 0)))
        data = await api(`/tasks?${p}`)
        break
      }

      case 'get_task':
        data = await api(`/tasks/${args.id}`)
        break

      case 'transition_task':
        data = await api(`/tasks/${args.id}/transition`, {
          method: 'POST',
          body: JSON.stringify({
            transitionName: args.transitionName,
            comment:        args.comment ?? undefined,
            result:         args.result  ?? undefined,
          }),
        })
        break

      case 'add_comment':
        data = await api(`/tasks/${args.id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ comment: args.comment }),
        })
        break

      case 'create_task':
        data = await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            workflowId:  args.workflowId,
            title:       args.title,
            description: args.description ?? undefined,
            assignedTo:  args.assignedTo  ?? undefined,
            priority:    Number(args.priority ?? 0),
            context:     args.context ?? {},
          }),
        })
        break

      case 'list_workflows':
        data = await api('/workflows')
        break

      case 'create_workflow':
        data = await api('/workflows/full', {
          method: 'POST',
          body: JSON.stringify({
            name:        args.name,
            description: args.description ?? undefined,
            states:      args.states      ?? [],
            transitions: args.transitions ?? [],
          }),
        })
        break

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
