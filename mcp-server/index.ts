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

const BASE_URL       = (process.env.AGENTTASK_URL          ?? 'http://localhost:3000').replace(/\/$/, '')
const API_KEY        =  process.env.AGENTTASK_API_KEY       ?? ''
const AGENT_ID       =  process.env.AGENTTASK_AGENT_ID      ?? 'claude-code'
const ADMIN_PASSWORD =  process.env.AGENTTASK_ADMIN_PASSWORD ?? ''

if (!API_KEY) {
  process.stderr.write('[agenttask-mcp] WARNING: AGENTTASK_API_KEY is not set — requests will be rejected\n')
}
if (!ADMIN_PASSWORD) {
  process.stderr.write('[agenttask-mcp] INFO: AGENTTASK_ADMIN_PASSWORD not set — admin tools (agent/envvar/workflow management) will be unavailable\n')
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

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

// Admin session — lazy login with human password for human-only endpoints
let adminCookie = ''

async function getAdminCookie(): Promise<string> {
  if (adminCookie) return adminCookie
  if (!ADMIN_PASSWORD) throw new Error('AGENTTASK_ADMIN_PASSWORD is not set — admin operations unavailable')
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Admin login failed: HTTP ${res.status}`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/session=([^;]+)/)
  if (!match) throw new Error('Admin login: no session cookie in response')
  adminCookie = `session=${match[1]}`
  return adminCookie
}

async function adminApi(path: string, init?: RequestInit, retried = false): Promise<unknown> {
  const cookie = await getAdminCookie()
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!text) return null
  const data = JSON.parse(text)
  if (!res.ok) {
    if (res.status === 401 && !retried) {
      adminCookie = '' // session expired — re-login once
      return adminApi(path, init, true)
    }
    throw new Error(data?.error ?? `HTTP ${res.status}`)
  }
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
      description: 'List workflows. Optionally filter by project slug or projectId.',
      inputSchema: {
        type: 'object',
        properties: {
          projectSlug: { type: 'string', description: 'Filter by project slug, e.g. "backend"' },
          projectId:   { type: 'string', description: 'Filter by project ID' },
        },
      },
    },
    {
      name: 'list_projects',
      description: 'List all projects with their workflows. Use to discover the project namespace structure.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_project',
      description: 'Create a new project. Use this to group related workflows and tasks together.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the project' },
          slug: { type: 'string', description: 'URL-friendly slug (e.g. "stock-screener")' },
          description: { type: 'string', description: 'Description of the project' },
          color: { type: 'string', description: 'Color hex code (default #6B7280)' },
        },
        required: ['name', 'slug'],
      },
    },
    // ── Admin tools (require AGENTTASK_ADMIN_PASSWORD) ─────────────────
    {
      name: 'list_agents',
        description: 'List all agents with their configuration (provider, model, tools, enabled status).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_agent',
        description: 'Get full agent details: system prompt, tools, model, env vars assigned.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Agent ID' } },
          required: ['id'],
        },
      },
      {
        name: 'create_agent',
        description: 'Create a new agent. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: {
            name:          { type: 'string',  description: 'Agent name' },
            description:   { type: 'string',  description: 'What this agent does' },
            model:         { type: 'string',  description: 'LLM model, e.g. "claude-sonnet-4-6"' },
            provider:      { type: 'string',  description: 'LLM provider: anthropic, openai, openrouter, ollama' },
            baseUrl:       { type: 'string',  description: 'Custom base URL (for OpenRouter/Ollama)' },
            apiKey:        { type: 'string',  description: 'API key for this agent\'s LLM' },
            systemPrompt:  { type: 'string',  description: 'System prompt instructions' },
            tools:         { type: 'array', items: { type: 'string' }, description: 'Tool names: bash, playwright_navigate, http_request, read_file, write_file, etc.' },
            maxTokens:     { type: 'number',  description: 'Max tokens per LLM call (default 2048)' },
            temperature:   { type: 'number',  description: 'Temperature 0.0–1.0 (default 0.7)' },
            maxIterations: { type: 'number',  description: 'Max agentic loop iterations (default 20)' },
            enabled:       { type: 'boolean', description: 'Whether agent is active (default true)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_agent',
        description: 'Update an agent\'s config: system prompt, model, tools, temperature, etc. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: {
            id:            { type: 'string',  description: 'Agent ID' },
            name:          { type: 'string' },
            description:   { type: 'string' },
            model:         { type: 'string' },
            provider:      { type: 'string' },
            baseUrl:       { type: 'string' },
            apiKey:        { type: 'string' },
            systemPrompt:  { type: 'string' },
            tools:         { type: 'array', items: { type: 'string' } },
            maxTokens:     { type: 'number' },
            temperature:   { type: 'number' },
            maxIterations: { type: 'number' },
            enabled:       { type: 'boolean' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_env_vars',
        description: 'List all environment variables (keys + descriptions, values masked). Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'create_env_var',
        description: 'Create an environment variable (secret). Assign it to agents via set_agent_env_vars. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: {
            key:         { type: 'string', description: 'Variable name, e.g. OPENAI_API_KEY (auto-uppercased)' },
            value:       { type: 'string', description: 'Secret value' },
            description: { type: 'string', description: 'What this variable is used for' },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'delete_env_var',
        description: 'Delete an environment variable by ID. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'EnvVar ID (from list_env_vars)' } },
          required: ['id'],
        },
      },
      {
        name: 'get_agent_env_vars',
        description: 'List environment variables assigned to an agent. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: { agentId: { type: 'string', description: 'Agent ID' } },
          required: ['agentId'],
        },
      },
      {
        name: 'set_agent_env_vars',
        description: 'Replace the set of env vars assigned to an agent (supply IDs from list_env_vars). Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId:   { type: 'string', description: 'Agent ID' },
            envVarIds: { type: 'array', items: { type: 'string' }, description: 'EnvVar IDs to assign (replaces current list)' },
          },
          required: ['agentId', 'envVarIds'],
        },
      },
      {
        name: 'update_workflow',
        description: 'Update workflow settings: sandbox mode, workspace path, GitHub repo, webhook URL. Requires AGENTTASK_ADMIN_PASSWORD.',
        inputSchema: {
          type: 'object',
          properties: {
            id:            { type: 'string', description: 'Workflow ID (from list_workflows)' },
            name:          { type: 'string' },
            description:   { type: 'string' },
            sandboxMode:   { type: 'string', description: '"docker" or "none"' },
            dockerImage:   { type: 'string', description: 'Docker image e.g. "node:20-slim"' },
            gitCloneUrl:   { type: 'string', description: 'Git repo to clone into container on start' },
            workspaceType: { type: 'string', description: '"local" or "github"' },
            workspacePath: { type: 'string', description: 'Local path to working directory' },
            githubRepo:    { type: 'string', description: 'GitHub repo e.g. "owner/repo"' },
            githubBranch:  { type: 'string', description: 'Git branch' },
            webhookUrl:    { type: 'string', description: 'Webhook URL called on state changes' },
            webhookSecret: { type: 'string', description: 'HMAC secret for webhook signature' },
            setupScript:   { type: 'string', description: 'Bash script run on HOST before agent starts. Use TASK_ID and WORKSPACE_PATH env vars. Name containers ${TASK_ID}-<service> for auto-cleanup.' },
          },
          required: ['id'],
        },
      },
      // ── Analytics ────────────────────────────────────────────────────────
      {
        name: 'get_analytics_summary',
        description: 'LLM call analytics: total calls, success rate, usage by agent and model, daily trend.',
        inputSchema: {
          type: 'object',
          properties: {
            since: { type: 'string', description: 'ISO date string e.g. "2024-01-01" (default: last 7 days)' },
          },
        },
      },
      {
        name: 'list_llm_calls',
        description: 'List individual LLM calls with latency, tokens, and success. Useful for debugging agent failures.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId:    { type: 'string',  description: 'Filter by task ID' },
            agentName: { type: 'string',  description: 'Filter by agent name' },
            failed:    { type: 'boolean', description: 'Only show failed calls' },
            limit:     { type: 'number',  description: 'Max results (default 50, max 200)' },
            offset:    { type: 'number',  description: 'Pagination offset' },
          },
        },
      },
      // ── Workflow creation ─────────────────────────────────────────────────
      {
        name: 'create_workflow',
        description:
          'Create a complete workflow — name, states, transitions, and workspace/sandbox settings — in a single call. ' +
          'Use this when the user asks you to design or generate a new workflow. ' +
          'States are created in the order provided; the first state marked isInitial becomes the entry point. ' +
          'Transitions wire states together; reference states by their name field (case-insensitive). ' +
          'Set workspacePath + workspaceType to tell agents where the project lives. ' +
          'Set setupScript to spin up service containers before the agent starts.',
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
            projectSlug: {
              type: 'string',
              description: 'Assign to a project by slug, e.g. "backend". Use list_projects to find slugs.',
            },
            projectId: {
              type: 'string',
              description: 'Assign to a project by ID (alternative to projectSlug)',
            },
            // ── Workspace ──────────────────────────────────────────────
            workspaceType: {
              type: 'string',
              description: '"local" — agents access files at workspacePath on the server; "github" — agents clone githubRepo',
            },
            workspacePath: {
              type: 'string',
              description: 'Absolute server path agents operate in, e.g. "/srv/myproject" (local mode)',
            },
            githubRepo: {
              type: 'string',
              description: 'GitHub repo for agents, e.g. "owner/repo" (github mode)',
            },
            githubBranch: {
              type: 'string',
              description: 'Branch to use (github mode), default "main"',
            },
            // ── Sandbox ────────────────────────────────────────────────
            sandboxMode: {
              type: 'string',
              description: '"docker" — agent runs in an isolated container per task; omit for direct server execution',
            },
            dockerImage: {
              type: 'string',
              description: 'Docker image for the agent container, e.g. "node:20-slim" (docker mode only)',
            },
            gitCloneUrl: {
              type: 'string',
              description: 'Git URL cloned into /workspace inside the agent container on start',
            },
            setupScript: {
              type: 'string',
              description:
                'Bash script run on HOST before the agent starts. Use to spin up service containers. ' +
                'Env vars available: TASK_ID, WORKSPACE_PATH, all agent env vars. ' +
                'Name containers "${TASK_ID}-<service>" — they are auto-stopped/removed when the task ends. ' +
                'Example: docker run -d --name "${TASK_ID}-db" postgres:16-alpine',
            },
            // ── Webhook ────────────────────────────────────────────────
            webhookUrl: {
              type: 'string',
              description: 'URL called on every state transition (POST with task + transition JSON)',
            },
            webhookSecret: {
              type: 'string',
              description: 'HMAC secret sent as X-Webhook-Secret header',
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
                  agentId:                 { type: 'string',  description: 'ID of the agent auto-invoked when a task enters this state. Use list_agents to find IDs.' },
                  completionTransitionName: { type: 'string', description: 'Transition the agent calls when done, e.g. "complete"' },
                  stateInstructions:       { type: 'string',  description: 'Instructions injected into the agent prompt for this state. Be specific: what to do, what files to write, what transition to call.' },
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

      case 'list_workflows': {
        const p = new URLSearchParams()
        // Resolve projectSlug → projectId via list_projects
        if (args.projectSlug || args.projectId) {
          if (args.projectSlug) {
            const projects = await api('/projects') as Array<{ id: string; slug: string }>
            const proj = projects.find(p => p.slug === args.projectSlug)
            if (proj) p.set('projectId', proj.id)
          } else {
            p.set('projectId', String(args.projectId))
          }
        }
        data = await api(`/workflows${p.toString() ? '?' + p.toString() : ''}`)
        break
      }

      case 'list_projects':
        data = await api('/projects')
        break

      case 'create_project':
        data = await api('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: args.name,
            slug: args.slug,
            description: args.description ?? undefined,
            color: args.color ?? undefined,
          }),
        })
        break

      case 'create_workflow':
        data = await api('/workflows/full', {
          method: 'POST',
          body: JSON.stringify({
            name:          args.name,
            description:   args.description   ?? undefined,
            projectSlug:   args.projectSlug   ?? undefined,
            projectId:     args.projectId     ?? undefined,
            workspaceType: args.workspaceType  ?? undefined,
            workspacePath: args.workspacePath  ?? undefined,
            githubRepo:    args.githubRepo     ?? undefined,
            githubBranch:  args.githubBranch   ?? undefined,
            sandboxMode:   args.sandboxMode    ?? undefined,
            dockerImage:   args.dockerImage    ?? undefined,
            gitCloneUrl:   args.gitCloneUrl    ?? undefined,
            setupScript:   args.setupScript    ?? undefined,
            webhookUrl:    args.webhookUrl     ?? undefined,
            webhookSecret: args.webhookSecret  ?? undefined,
            states:        args.states         ?? [],
            transitions:   args.transitions    ?? [],
          }),
        })
        break

      // ── Agent management ────────────────────────────────────────────────
      case 'list_agents':
        data = await api('/agents')
        break

      case 'get_agent':
        data = await api(`/agents/${args.id}`)
        break

      case 'create_agent':
        data = await adminApi('/agents', {
          method: 'POST',
          body: JSON.stringify({
            name:          args.name,
            description:   args.description   ?? undefined,
            model:         args.model         ?? undefined,
            provider:      args.provider      ?? 'anthropic',
            baseUrl:       args.baseUrl       ?? undefined,
            apiKey:        args.apiKey        ?? undefined,
            systemPrompt:  args.systemPrompt  ?? undefined,
            tools:         args.tools         ?? [],
            maxTokens:     args.maxTokens     ?? 2048,
            temperature:   args.temperature   ?? 0.7,
            maxIterations: args.maxIterations ?? 20,
            enabled:       args.enabled       ?? true,
          }),
        })
        break

      case 'update_agent': {
        const agentBody: Record<string, unknown> = {}
        const agentFields = ['name','description','model','provider','baseUrl','apiKey','systemPrompt','tools','maxTokens','temperature','maxIterations','enabled'] as const
        for (const f of agentFields) if (f in args) agentBody[f] = args[f]
        data = await adminApi(`/agents/${args.id}`, { method: 'PATCH', body: JSON.stringify(agentBody) })
        break
      }

      // ── Env vars ────────────────────────────────────────────────────────
      case 'list_env_vars':
        data = await adminApi('/envvars')
        break

      case 'create_env_var':
        data = await adminApi('/envvars', {
          method: 'POST',
          body: JSON.stringify({
            key:         args.key,
            value:       args.value,
            description: args.description ?? undefined,
          }),
        })
        break

      case 'delete_env_var':
        data = await adminApi(`/envvars/${args.id}`, { method: 'DELETE' })
        break

      case 'get_agent_env_vars':
        data = await adminApi(`/agents/${args.agentId}/envvars`)
        break

      case 'set_agent_env_vars':
        data = await adminApi(`/agents/${args.agentId}/envvars`, {
          method: 'PUT',
          body: JSON.stringify({ envVarIds: args.envVarIds }),
        })
        break

      // ── Workflow settings ────────────────────────────────────────────────
      case 'update_workflow': {
        const wfBody: Record<string, unknown> = {}
        const wfFields = ['name','description','sandboxMode','dockerImage','gitCloneUrl','workspaceType','workspacePath','githubRepo','githubBranch','webhookUrl','webhookSecret','setupScript'] as const
        for (const f of wfFields) if (f in args) wfBody[f] = args[f]
        data = await adminApi(`/workflows/${args.id}`, { method: 'PUT', body: JSON.stringify(wfBody) })
        break
      }

      // ── Analytics ────────────────────────────────────────────────────────
      case 'get_analytics_summary': {
        const p = new URLSearchParams()
        if (args.since) p.set('since', String(args.since))
        data = await api(`/analytics/summary${p.toString() ? '?' + p.toString() : ''}`)
        break
      }

      case 'list_llm_calls': {
        const p = new URLSearchParams()
        if (args.taskId)    p.set('taskId',    String(args.taskId))
        if (args.agentName) p.set('agentName', String(args.agentName))
        if (args.failed)    p.set('failed', 'true')
        p.set('limit',  String(Math.min(Number(args.limit  ?? 50), 200)))
        p.set('offset', String(Number(args.offset ?? 0)))
        data = await api(`/analytics/llm-calls?${p}`)
        break
      }

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
