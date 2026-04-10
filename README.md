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

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with optional filters (workflow, assignee, blocking) |
| `get_task` | Full task detail + available transitions |
| `transition_task` | Execute a transition (do work → mark done / send for review) |
| `add_comment` | Add a progress comment without changing state |
| `list_workflows` | List all workflows |

### Example session

```
You: list my tasks
Claude: [lists tasks assigned to claude-code]

You: work on task cma1b2c3d
Claude: [reads task, implements feature, transitions to pending_review]
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
