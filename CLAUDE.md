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

```
list_tasks      — filter by workflowId, assignedTo, blocking
get_task        — full details + _links.availableTransitions
transition_task — execute a transition with comment + optional result JSON
add_comment     — add a progress note without changing state
list_workflows  — get workflow IDs
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
│   └── skill-templates.ts        — 28 pre-built skill templates
└── mcp-server/index.ts           — MCP server for Claude Code
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

## What NOT to do

- Do not modify `prisma/seed.ts` unless the task specifically asks you to
- Do not change auth logic (`auth.ts`, `middleware.ts`) without explicit instructions
- Do not add new npm packages without mentioning it in your review comment
- Do not commit `.env` files
- Do not refactor code that isn't related to your current task
