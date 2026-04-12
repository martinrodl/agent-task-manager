# AgentTask — Instructions for Claude Code

You are working as a development agent on the AgentTask project itself. This file explains how to pick up tasks, implement them, and submit for review.

## Your workflow

Tasks are managed in AgentTask at http://localhost:3000. Use the MCP tools to interact with them.

### Step-by-step

1. **Find work**: `list_tasks` with `workflowId` of the "AgentTask Development" workflow, filter `assignedTo: "claude-code"` or look in Backlog
2. **Pick a task**: `get_task <id>` — read the full description, context, and state instructions
3. **Start planning**: transition `start_planning` — think through the approach, write your plan as the comment
4. **Implement**: transition `begin_impl` — make the code changes
5. **Submit**: transition `submit_review` with a comment describing what you changed and what the reviewer should test
6. **Handle feedback**: if `request_changes` comes back, read the comment, fix it, resubmit

### MCP tools available

**Task operations** (agent API key, any actor):
```
list_tasks         — filter by workflowId, assignedTo, blocking, limit/offset
get_task           — full details + _links.availableTransitions
transition_task    — execute a transition with comment + optional result JSON
add_comment        — add a progress note without changing state
create_task        — create a new task in a workflow
list_workflows     — list workflows, optionally filter by project
list_projects      — list all projects with their workflows
create_project     — create a new project (name, slug, description, color)
create_workflow    — create a complete workflow with states + transitions in one call
get_analytics_summary — LLM call stats: success rate, token usage, daily trend
list_llm_calls     — per-call log with latency, tokens, errors (debug agent failures)
```

**Admin operations** (require `AGENTTASK_ADMIN_PASSWORD` in MCP server env):
```
list_agents        — list all agents with config
get_agent          — full agent detail (system prompt, tools, model)
create_agent       — create a new agent
update_agent       — update model, system prompt, tools, temperature, etc.
list_env_vars      — list env var keys (values masked)
create_env_var     — add a secret/env var (KEY=value)
delete_env_var     — remove an env var
get_agent_env_vars — list env vars assigned to an agent
set_agent_env_vars — assign env vars to an agent (replaces current list)
update_workflow    — update sandbox, workspace, webhook, setupScript settings
```

## Project structure

```
apps/agenttask/
├── prisma/schema.prisma          — database schema (Prisma)
├── src/app/                      — Next.js App Router pages
│   ├── api/v1/                   — REST API routes
│   ├── tasks/                    — task UI
│   ├── workflows/                — workflow builder UI
│   ├── agents/                   — agent config UI
│   ├── skills/                   — skills UI
│   ├── review/                   — HITL review queue
│   └── settings/                 — AI providers
├── src/components/               — shared UI components
│   ├── kanban-board.tsx          — kanban board
│   ├── workflow-builder.tsx      — workflow state machine editor
│   └── ai-assist.tsx             — AI fill button
├── src/lib/
│   ├── state-machine.ts          — transition logic, webhook, SSE
│   ├── agent-runner.ts           — LLM invocation on state entry
│   ├── agent-connector.ts        — multi-provider LLM client
│   ├── auth.ts                   — session + API key auth
│   ├── skill-templates.ts        — 28 pre-built skill templates
│   └── tools/                    — agentic tool providers
│       ├── types.ts              — ToolContext, ToolProvider, ToolResult interfaces
│       ├── index.ts              — provider registry (build/resolve by name)
│       ├── loop.ts               — agenticLoop() — multi-turn LLM + tool execution
│       ├── bash.ts               — bash_run (local or Docker sandbox)
│       ├── http.ts               — http_request
│       ├── file.ts               — read_file, write_file, list_files
│       └── playwright.ts         — playwright_navigate, playwright_click, playwright_screenshot, …
├── mcp-server/
│   ├── index.ts                  — stdio MCP server (for Claude Code CLI)
│   └── http-server.ts            — HTTP MCP server (for remote agents)
└── k8s/                          — Kubernetes manifests
```

## Tech stack

- **Next.js 15** App Router, React 19, TypeScript
- **Prisma 5** + PostgreSQL — use `npx prisma db push` for schema changes (no migration files needed in dev)
- **Tailwind CSS** — styling, no component library
- **SSE** (`/api/v1/stream/tasks`) — live updates to kanban and review page
- **lucide-react** — icons

## Code conventions

- Server components fetch data directly via `prisma.*`; client components use `fetch('/api/v1/...')`
- API routes: always call `resolveActor(req)` first and return 401 if null
- New schema fields: add to `schema.prisma` then run `npx prisma db push`
- Client components: mark with `'use client'` at the top
- No external state management — React `useState` + `useEffect` is fine
- No component library — custom Tailwind classes only

## Running locally

```bash
cd apps/agenttask
npm run dev          # start dev server on :3000
npm run db:push      # apply schema changes
npm run db:studio    # open Prisma Studio
```

## How to store structured output

When you complete a task, put structured data in the `result` field of `transition_task`:

```json
{
  "transitionName": "submit_review",
  "comment": "Implemented X. Changed files A, B, C. To test: do Y.",
  "result": {
    "filesChanged": ["src/lib/foo.ts", "src/app/bar/page.tsx"],
    "summary": "Added X feature",
    "prUrl": "https://github.com/..."
  }
}
```

URLs in `result` (keys containing "url", "link", "pr") are automatically surfaced as clickable buttons on the task detail page.

## Workflow configuration (for `update_workflow` / UI)

Each workflow has three groups of settings:

### Workspace — where agents operate
| Field | Values | Description |
|-------|--------|-------------|
| `workspaceType` | `"local"` \| `"github"` \| `null` | How agents access project files |
| `workspacePath` | absolute path | Server-side folder (local mode) |
| `githubRepo` | `"owner/repo"` | GitHub repo (github mode) |
| `githubBranch` | branch name | Default: `"main"` |

### Sandbox — agent isolation
| Field | Values | Description |
|-------|--------|-------------|
| `sandboxMode` | `"docker"` \| `null` | `"docker"` = isolated container per task; `null` = run directly on server |
| `dockerImage` | e.g. `"node:20-slim"` | Image for the agent container (docker mode only) |
| `gitCloneUrl` | git URL | Cloned into `/workspace` on container start |
| `setupScript` | bash script | **Runs on HOST before agent starts** — use to start service containers |

### Setup script — multi-service environments
`setupScript` solves the problem of testing projects that need multiple services (DB, API, frontend).
It runs as a bash script on the server host with these env vars available:
- `TASK_ID` — unique task identifier (use to name containers for auto-cleanup)
- `WORKSPACE_PATH` — workflow's workspace path
- All agent env vars (e.g. `DATABASE_URL`, `API_KEY`, etc.)

**Naming convention**: name service containers `${TASK_ID}-<service>` — they are automatically stopped and removed when the task finishes.

**Example** (stock-screener: web + API + database):
```bash
# Create isolated network
docker network create "${TASK_ID}-net" 2>/dev/null || true

# Start database
docker run -d --name "${TASK_ID}-db" --network "${TASK_ID}-net" \
  -e POSTGRES_PASSWORD=test postgres:16-alpine

# Start backend API
docker run -d --name "${TASK_ID}-be" --network "${TASK_ID}-net" \
  --env-file /srv/stock-screener/.env \
  -e DATABASE_URL="postgresql://postgres:test@${TASK_ID}-db:5432/app" \
  my-registry/be-nest:latest

# Start frontend (bind to localhost so agent can reach it)
docker run -d --name "${TASK_ID}-web" --network "${TASK_ID}-net" \
  -p 3099:3000 \
  -e API_URL=http://localhost:3001 \
  my-registry/stock-screener-web:latest

# Wait for services to be ready
sleep 8
```

The agent container uses `--network=host` so it can reach services at `localhost:PORT`.

**If the project already has docker-compose.yml**:
```bash
cd "${WORKSPACE_PATH}"
COMPOSE_PROJECT_NAME="${TASK_ID}" docker-compose up -d
```
Teardown: name your compose project `${TASK_ID}` and the auto-cleanup handles `docker rm`.

### Webhook — called on every state transition
| Field | Description |
|-------|-------------|
| `webhookUrl` | POST target — receives task + transition JSON |
| `webhookSecret` | HMAC secret sent as `X-Webhook-Secret` header |

---

## Agent configuration

Agents are configured at `/agents` in the UI or via MCP `create_agent` / `update_agent`.

Key fields:
| Field | Description |
|-------|-------------|
| `model` | LLM model e.g. `claude-sonnet-4-6`, `gpt-4o`, `openrouter/...` |
| `provider` | `anthropic` \| `openai` \| `openrouter` \| `ollama` |
| `systemPrompt` | Base instructions — skills are appended at the end |
| `tools` | Array of enabled tool providers: `["bash", "playwright_navigate", "http_request", "read_file"]` |
| `maxIterations` | Max agentic loop turns before giving up (default 20) |

### Available tools for agents
| Tool name | Provider | Description |
|-----------|----------|-------------|
| `bash_run` | `bash` | Execute bash commands (host or Docker container) |
| `playwright_navigate` | `playwright` | Navigate browser to URL |
| `playwright_click` | `playwright` | Click element by CSS selector |
| `playwright_fill` | `playwright` | Fill input field |
| `playwright_screenshot` | `playwright` | Take screenshot (returns base64, shown in task UI) |
| `playwright_get_text` | `playwright` | Extract text content |
| `playwright_evaluate` | `playwright` | Run JavaScript in page |
| `playwright_wait_for` | `playwright` | Wait for selector to appear |
| `http_request` | `http` | Make arbitrary HTTP requests |
| `read_file` | `file` | Read file from workspace |
| `write_file` | `file` | Write file to workspace |
| `list_files` | `file` | List directory contents |

### Env vars / secrets
1. Create env var: `create_env_var` (key, value, description)
2. Assign to agent: `set_agent_env_vars` (agentId, envVarIds[])
3. Values are injected into agent prompt as "Available credentials" and into `bash_run` environment

---

## What NOT to do

- Do not modify `prisma/seed.ts` unless the task specifically asks you to
- Do not change auth logic (`auth.ts`, `middleware.ts`) without explicit instructions
- Do not add new npm packages without mentioning it in your review comment
- Do not commit `.env` files
- Do not refactor code that isn't related to your current task
