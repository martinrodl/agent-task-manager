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
 *   AGENTTASK_URL=http://localhost:3001       (AgentTask app)
 *   AGENTTASK_API_KEY=agent-key-change-me    (internal agent key)
 *   MCP_SECRET=<strong-random-secret>        (token MCP clients must send)
 *   MCP_PORT=4040                            (port this server listens on)
 *   MCP_AGENT_ID=remote-agent               (how remote agents appear in task history)
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

const BASE_URL   = (process.env.AGENTTASK_URL     ?? 'http://localhost:3001').replace(/\/$/, '')
const API_KEY    =  process.env.AGENTTASK_API_KEY  ?? ''
const MCP_SECRET =  process.env.MCP_SECRET         ?? ''
const MCP_PORT   =  Number(process.env.MCP_PORT    ?? 4040)
const AGENT_ID   =  process.env.MCP_AGENT_ID       ?? 'remote-agent'

if (!MCP_SECRET) {
  process.stderr.write('[mcp-http] ERROR: MCP_SECRET is not set — all requests will be rejected\n')
}
if (!API_KEY) {
  process.stderr.write('[mcp-http] WARNING: AGENTTASK_API_KEY is not set\n')
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
