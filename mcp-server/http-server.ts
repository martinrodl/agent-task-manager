#!/usr/bin/env node
/**
 * AgentTask MCP HTTP Server
 *
 * Exposes the same AgentTask tools over HTTP (MCP Streamable HTTP transport)
 * so remote clients — Gemini CLI, Claude API, other LLM agents — can connect.
 *
 * Security layers:
 *   1. Bearer token  — MCP_SECRET env var, checked on every request
 *   2. Rate limiting — 60 requests/min per IP (configurable)
 *   3. HTTPS         — handled by reverse proxy (Caddy / nginx)
 *
 * Configuration (env vars):
 *   AGENTTASK_URL=http://localhost:3001              (AgentTask app)
 *   AGENTTASK_API_KEY=agent-key-change-me           (internal agent key)
 *   AGENTTASK_ADMIN_PASSWORD=your-admin-password    (enables agent/envvar/workflow admin tools)
 *   MCP_SECRET=<strong-random-secret>               (token MCP clients must send)
 *   MCP_PORT=4040                                   (port this server listens on)
 *   MCP_AGENT_ID=remote-agent                       (how remote agents appear in task history)
 *
 * Usage (remote client config):
 *   {
 *     "mcpServers": {
 *       "agenttask": {
 *         "url": "https://mcp.yourdomain.com/mcp",
 *         "headers": { "Authorization": "Bearer <MCP_SECRET>" }
 *       }
 *     }
 *   }
 *
 * Reverse proxy (Caddy example):
 *   mcp.yourdomain.com {
 *     reverse_proxy localhost:4040
 *   }
 */

import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BASE_URL       = (process.env.AGENTTASK_URL          ?? 'http://localhost:3001').replace(/\/$/, '')
const API_KEY        =  process.env.AGENTTASK_API_KEY       ?? ''
const MCP_SECRET     =  process.env.MCP_SECRET              ?? ''
const MCP_PORT       =  Number(process.env.MCP_PORT         ?? 4040)
const AGENT_ID       =  process.env.MCP_AGENT_ID            ?? 'remote-agent'
const ADMIN_PASSWORD =  process.env.AGENTTASK_ADMIN_PASSWORD ?? ''

if (!MCP_SECRET) {
  process.stderr.write('[mcp-http] ERROR: MCP_SECRET is not set — all requests will be rejected\n')
}
if (!API_KEY) {
  process.stderr.write('[mcp-http] WARNING: AGENTTASK_API_KEY is not set\n')
}
if (!ADMIN_PASSWORD) {
  process.stderr.write('[mcp-http] INFO: AGENTTASK_ADMIN_PASSWORD not set — admin tools unavailable\n')
}

// ─── Rate limiter (token bucket per IP) ──────────────────────────────────────

const RATE_LIMIT      = Number(process.env.MCP_RATE_LIMIT ?? 60)   // requests
const RATE_WINDOW_MS  = 60_000                                        // per minute

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  let bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS }
    rateBuckets.set(ip, bucket)
  }
  bucket.count++
  return bucket.count <= RATE_LIMIT
}

// Clean up expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(ip)
  }
}, 5 * 60_000).unref()

// ─── AgentTask API helper ─────────────────────────────────────────────────────

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-Agent-Id':    AGENT_ID,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!text) return null
  const data = JSON.parse(text)
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data
}

// ─── Admin session (lazy login for human-only endpoints) ─────────────────────

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
  process.stderr.write('[mcp-http] Admin session established\n')
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

// ─── MCP server factory (one per session) ────────────────────────────────────

function createMcpServer() {
  const server = new Server(
    { name: 'agenttask', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_tasks',
        description: 'List tasks from AgentTask. Returns each task with its current state and available transitions.',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', description: 'Filter by workflow ID' },
            assignedTo: { type: 'string', description: 'Filter by assignee (agent name or "me")' },
            blocking:   { type: 'boolean', description: 'Only tasks requiring human review' },
            limit:      { type: 'number',  description: 'Max results (default 20, max 50)' },
            offset:     { type: 'number',  description: 'Pagination offset' },
          },
        },
      },
      {
        name: 'get_task',
        description: 'Get full task details including context, result, events, and available transitions.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Task ID' } },
          required: ['id'],
        },
      },
      {
        name: 'transition_task',
        description: 'Execute a state transition. Use get_task first to see available transitionNames.',
        inputSchema: {
          type: 'object',
          properties: {
            id:             { type: 'string', description: 'Task ID' },
            transitionName: { type: 'string', description: 'Transition name from get_task _links' },
            comment:        { type: 'string', description: 'Summary of work done' },
            result:         { type: 'object', description: 'Structured output (arbitrary JSON)' },
          },
          required: ['id', 'transitionName'],
        },
      },
      {
        name: 'add_comment',
        description: 'Add a comment to a task without changing its state.',
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
        description: 'Create a new task in a workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId:  { type: 'string', description: 'Workflow ID' },
            title:       { type: 'string', description: 'Short task title' },
            description: { type: 'string', description: 'Detailed description (Markdown)' },
            assignedTo:  { type: 'string', description: 'Agent or user to assign to' },
            priority:    { type: 'number', description: '0=Low 1=Medium 2=High 3=Critical' },
            context:     { type: 'object', description: 'Structured input for the agent (any JSON)' },
          },
          required: ['workflowId', 'title'],
        },
      },
      {
        name: 'list_workflows',
        description: 'List all workflows, optionally filtered by project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectSlug: { type: 'string' },
            projectId:   { type: 'string' },
          },
        },
      },
      {
        name: 'list_projects',
        description: 'List all projects with their workflows.',
        inputSchema: { type: 'object', properties: {} },
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
            color: { type: 'string', description: 'Color hex code' },
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
        description: 'Replace the set of env vars assigned to an agent. Requires AGENTTASK_ADMIN_PASSWORD.',
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
          if (args.projectSlug) {
            const projects = await api('/projects') as Array<{ id: string; slug: string }>
            const proj = projects.find(p => p.slug === args.projectSlug)
            if (proj) p.set('projectId', proj.id)
          } else if (args.projectId) {
            p.set('projectId', String(args.projectId))
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

        // ── Agent management ──────────────────────────────────────────────
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

        // ── Env vars ──────────────────────────────────────────────────────
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

        // ── Workflow settings ─────────────────────────────────────────────
        case 'update_workflow': {
          const wfBody: Record<string, unknown> = {}
          const wfFields = ['name','description','sandboxMode','dockerImage','gitCloneUrl','workspaceType','workspacePath','githubRepo','githubBranch','webhookUrl','webhookSecret','setupScript'] as const
          for (const f of wfFields) if (f in args) wfBody[f] = args[f]
          data = await adminApi(`/workflows/${args.id}`, { method: 'PUT', body: JSON.stringify(wfBody) })
          break
        }

        // ── Analytics ─────────────────────────────────────────────────────
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

      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      }
    }
  })

  return server
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
// One StreamableHTTPServerTransport per session (stateful).
// Sessions are identified by Mcp-Session-Id header after init.

const transports = new Map<string, StreamableHTTPServerTransport>()

function unauthorized(res: http.ServerResponse, message: string) {
  res.writeHead(401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

function tooManyRequests(res: http.ServerResponse) {
  res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
  res.end(JSON.stringify({ error: 'Rate limit exceeded — try again in 60 seconds' }))
}

const httpServer = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown'

  // ── Rate limit ──────────────────────────────────────────────────────────
  if (!checkRateLimit(ip)) {
    process.stderr.write(`[mcp-http] Rate limit hit: ${ip}\n`)
    return tooManyRequests(res)
  }

  // ── Auth — Bearer token ─────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!MCP_SECRET || token !== MCP_SECRET) {
    process.stderr.write(`[mcp-http] Unauthorized request from ${ip}\n`)
    return unauthorized(res, 'Invalid or missing Bearer token')
  }

  // ── Health check ────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'agenttask-mcp', agentId: AGENT_ID }))
    return
  }

  // ── MCP endpoint ────────────────────────────────────────────────────────
  if (req.url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. MCP endpoint is /mcp' }))
    return
  }

  // Session management
  if (req.method === 'POST') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!
      await transport.handleRequest(req, res)
      return
    }

    // New session (initialize)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })

    const server = createMcpServer()
    await server.connect(transport)

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) {
        transports.delete(sid)
        process.stderr.write(`[mcp-http] Session closed: ${sid}\n`)
      }
    }

    await transport.handleRequest(req, res)

    const sid = transport.sessionId
    if (sid) {
      transports.set(sid, transport)
      process.stderr.write(`[mcp-http] New session: ${sid} from ${ip}\n`)
    }
    return
  }

  // GET — SSE stream for existing session
  if (req.method === 'GET') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing or invalid Mcp-Session-Id' }))
      return
    }
    await transports.get(sessionId)!.handleRequest(req, res)
    return
  }

  // DELETE — close session
  if (req.method === 'DELETE') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.close()
      transports.delete(sessionId)
    }
    res.writeHead(204)
    res.end()
    return
  }

  res.writeHead(405, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Method not allowed' }))
})

httpServer.listen(MCP_PORT, () => {
  process.stderr.write(`[mcp-http] AgentTask MCP HTTP server running on port ${MCP_PORT}\n`)
  process.stderr.write(`[mcp-http] MCP endpoint: http://localhost:${MCP_PORT}/mcp\n`)
  process.stderr.write(`[mcp-http] Health check: http://localhost:${MCP_PORT}/health\n`)
  process.stderr.write(`[mcp-http] Agent ID: ${AGENT_ID}\n`)
  process.stderr.write(`[mcp-http] Rate limit: ${RATE_LIMIT} req/min per IP\n`)
})
