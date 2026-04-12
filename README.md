# AgentTask

A task management system built for agentic workflows and human-in-the-loop review. Define state machines as workflows, assign AI agents to states, and let them process tasks automatically while humans approve the critical steps.

## What it does

- **Workflows** — define custom state machines (states + transitions) for any process
- **Tasks** — move through states; agents are auto-invoked when a task enters their state
- **HITL** — "blocking" states pause execution and notify humans for approval
- **Review queue** — single page to approve/reject all pending agent work
- **MCP server** — Claude Code connects via MCP and acts as a native agent
- **Skill templates** — 28 pre-built instruction sets (web search, GitHub, Slack, etc.)

## Quick start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use Docker)

### 2. Install & configure

```bash
cd apps/agenttask
cp .env.example .env
# Edit .env — set DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD, AGENT_API_KEY
npm install
```

### 3. Database setup

```bash
npm run db:push     # Apply schema
npm run db:seed     # Create example workflows + sample tasks
```

### 4. Run

```bash
npm run dev         # http://localhost:3000
```

Default login: `admin` / `admin` (set `ADMIN_PASSWORD` in `.env`)

---

## Docker (production)

```bash
docker-compose up -d
```

The compose file starts PostgreSQL and the Next.js app. On first boot run migrations manually:

```bash
docker-compose exec app npx prisma db push
docker-compose exec app npx tsx prisma/seed.ts
```

Then open http://localhost:3000.

---

## Connect Claude Code via MCP

The MCP server lets Claude Code read tasks, do work, and transition them — all from the CLI.

### Setup

```bash
cd apps/agenttask/mcp-server
npm install
```

Register with Claude Code (run once):

```bash
claude mcp add agenttask \
  -e AGENTTASK_URL=http://localhost:3000 \
  -e AGENTTASK_API_KEY=agent-key-change-me \
  -e AGENTTASK_AGENT_ID=claude-code \
  -- npx tsx /absolute/path/to/mcp-server/index.ts
```

Replace `/absolute/path/to/mcp-server` with the real path and `agent-key-change-me` with the value of `AGENT_API_KEY` from your `.env`.

### Available MCP tools

**Task & project operations** (any authenticated agent):

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks — filter by workflow, assignee, blocking |
| `get_task` | Full task detail + available transitions |
| `transition_task` | Execute a state transition with comment + result JSON |
| `add_comment` | Add a progress comment without changing state |
| `create_task` | Create a new task in a workflow |
| `list_workflows` | List workflows, optionally filter by project |
| `list_projects` | List all projects |
| `create_project` | Create a project (name, slug, description, color) |
| `create_workflow` | Create a complete workflow with states + transitions in one call |
| `get_analytics_summary` | LLM call stats: success rate, token usage, daily trend |
| `list_llm_calls` | Per-call log with latency, tokens, errors |

**Admin operations** (require `AGENTTASK_ADMIN_PASSWORD` env var on MCP server):

| Tool | Description |
|------|-------------|
| `list_agents` / `get_agent` | List or inspect agents |
| `create_agent` / `update_agent` | Create or update agent config (model, tools, system prompt) |
| `list_env_vars` / `create_env_var` / `delete_env_var` | Manage secrets / API keys |
| `get_agent_env_vars` / `set_agent_env_vars` | Assign env vars to agents |
| `update_workflow` | Update sandbox, workspace, webhook, `setupScript` |

### Example session

```
You: list my tasks
Claude: [lists tasks assigned to claude-code]

You: work on task cma1b2c3d
Claude: [reads task, implements feature, transitions to pending_review]
```

### Remote HTTP MCP server (for Gemini CLI, remote Claude, other LLMs)

```bash
cd apps/agenttask/mcp-server && npm install

MCP_SECRET=your-strong-secret \
AGENTTASK_URL=http://localhost:3000 \
AGENTTASK_API_KEY=agent-key-change-me \
AGENTTASK_ADMIN_PASSWORD=your-admin-password \
MCP_PORT=4040 \
npx tsx http-server.ts
```

Client config (any MCP-compatible LLM):
```json
{
  "mcpServers": {
    "agenttask": {
      "url": "https://mcp.yourdomain.com/mcp",
      "headers": { "Authorization": "Bearer your-strong-secret" }
    }
  }
}
```

---

## Agentic loop — agents with tools

When an agent has `tools` configured, it runs an **agentic loop** instead of a single LLM call:

1. LLM receives task prompt + available tool definitions
2. LLM calls tools (bash commands, HTTP requests, browser automation, file reads/writes)
3. Tool results fed back to LLM
4. Repeat until LLM outputs final `{ transitionName, comment, result }` JSON

### Tool providers

| Provider | Tools | Description |
|----------|-------|-------------|
| `bash` | `bash_run` | Execute bash commands — on server or in isolated Docker container |
| `playwright` | `playwright_navigate`, `playwright_click`, `playwright_fill`, `playwright_screenshot`, `playwright_get_text`, `playwright_evaluate`, `playwright_wait_for` | Browser automation — screenshots are displayed in task detail UI |
| `http` | `http_request` | Make HTTP requests (GET/POST/PUT/DELETE/PATCH) |
| `file` | `read_file`, `write_file`, `list_files` | Read/write files in workspace |

Configure tools on an agent: set the `tools` array e.g. `["bash", "playwright_navigate", "playwright_screenshot"]`.

---

## Workflow sandbox & setup script

### Sandbox modes

| Mode | Description |
|------|-------------|
| `null` (none) | Agent runs bash commands directly on the server |
| `"docker"` | One isolated container per task — stateful across tool calls, auto-removed on task end |

Docker container mounts a per-task `/workspace` scratch dir and the workflow path read-only. Uses `--network=host` so it can reach services on localhost.

### Setup script — multi-service environments

`setupScript` is a bash script run **on the HOST** before the agent starts. It solves the problem of testing projects that require multiple services (database + API + frontend).

**Available env vars in the script:**
- `TASK_ID` — unique task identifier
- `WORKSPACE_PATH` — workflow workspace path
- All agent env vars (your secrets, API keys, etc.)

**Auto-cleanup**: containers named `${TASK_ID}-<anything>` are automatically stopped and removed when the task finishes.

**Example — testing stock-screener (Next.js frontend + NestJS API + PostgreSQL):**

```bash
# Create network for this task
docker network create "${TASK_ID}-net" 2>/dev/null || true

# Database
docker run -d --name "${TASK_ID}-db" --network "${TASK_ID}-net" \
  -e POSTGRES_PASSWORD=test postgres:16-alpine

# Backend API
docker run -d --name "${TASK_ID}-be" --network "${TASK_ID}-net" \
  -e DATABASE_URL="postgresql://postgres:test@${TASK_ID}-db:5432/app" \
  -p 3001:3001 \
  my-registry/stock-screener-api:latest

# Frontend
docker run -d --name "${TASK_ID}-web" \
  -e NEXT_PUBLIC_API_URL=http://localhost:3001 \
  -p 3099:3000 \
  my-registry/stock-screener-web:latest

# Wait for services to start
sleep 8
```

The agent (with `playwright_navigate` tool) then tests at `http://localhost:3099`.

**If the project has docker-compose.yml:**
```bash
cd "${WORKSPACE_PATH}"
COMPOSE_PROJECT_NAME="${TASK_ID}" docker-compose up -d
```

---

## Agent API (REST)

Any agent (not just Claude Code) can use the REST API directly:

```bash
# Get tasks
curl http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "X-Agent-Id: my-agent"

# Get task + available transitions
curl http://localhost:3000/api/v1/tasks/TASK_ID \
  -H "Authorization: Bearer $AGENT_API_KEY"

# Execute a transition
curl -X POST http://localhost:3000/api/v1/tasks/TASK_ID/transition \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "X-Agent-Id: my-agent" \
  -H "Content-Type: application/json" \
  -d '{"transitionName": "complete", "comment": "Done", "result": {"output": "..."}}'
```

The response includes `_links.availableTransitions` — a HATEOAS list of what the agent can do next.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECRET_KEY` | Yes | JWT signing secret (32+ random chars) |
| `ADMIN_PASSWORD` | Yes | Password for the web UI admin |
| `AGENT_API_KEY` | Yes | Bearer token for agents |
| `ORCHESTRATOR_API_KEY` | No | Bearer token for orchestrator (elevated role) |

---

## Architecture

```
Browser / Claude Code
       │
       ▼
  Next.js App (App Router)
       │
       ├── /api/v1/tasks          — CRUD + transitions
       ├── /api/v1/workflows      — workflow + state management
       ├── /api/v1/review/queue   — HITL queue
       └── /api/v1/stream/tasks   — SSE live updates
       │
       ├── lib/state-machine.ts   — transition logic, webhook firing
       ├── lib/agent-runner.ts    — LLM invocation on state entry
       └── lib/agent-connector.ts — multi-provider LLM client
       │
  PostgreSQL (via Prisma)
```

### How agent execution works

1. Task enters a state that has an `agentId` configured
2. `state-machine.ts` calls `runAgent(taskId, agentName)` (fire-and-forget)
3. `agent-runner.ts` loads the agent config, builds a prompt with task data + available transitions
4. Calls the LLM (OpenAI, Anthropic, OpenRouter, Ollama, Claude Code CLI, …)
5. Parses the JSON response `{ transitionName, comment, result }`
6. Executes the transition — task moves to next state, event logged, SSE broadcast

---

## Workflow concepts

| Concept | Description |
|---------|-------------|
| **State** | A stage in the process (e.g. `IN_PROGRESS`, `PENDING_REVIEW`) |
| **Transition** | A named move between states; restricted by `allowedRoles` |
| **isInitial** | Task starts here when created |
| **isTerminal** | No further transitions; task is done |
| **isBlocking** | HITL checkpoint — appears in Review queue |
| **agentId** | Agent auto-invoked when task enters this state |
| **stateInstructions** | Extra instructions injected into agent prompt for this state |

### Roles

| Role | Who | Example |
|------|-----|---------|
| `human` | Web UI users | Approve, reject, add context |
| `agent` | Automated LLM agents | Do work, submit for review |
| `orchestrator` | Orchestration systems | Assign, route, escalate |
