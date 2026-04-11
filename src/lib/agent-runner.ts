/**
 * Agent runner — invoked after a task transitions into a state with an agentId.
 *
 * Flow:
 *  1. Look up the Agent config by name (= WorkflowState.agentId)
 *  2. Build a structured prompt from task data + available transitions
 *  3. Call the LLM via the matching connector
 *  4. Parse the JSON response: { transitionName, comment, result }
 *  5. Execute the transition (as actorType "agent")
 */

import { prisma } from './prisma'
import { callAgent } from './agent-connector'
import { executeTransition, LlmMeta } from './state-machine'
import { emitTaskEvent } from './sse'
import { startTimeoutWatcher } from './timeout-watcher'
import { agenticLoop } from './tools/loop'

// ─── Langfuse integration (optional, fire-and-forget) ─────────────────────────
// Active only when LANGFUSE_SECRET_KEY env var is set.
// Uses Langfuse batch ingestion API directly — no SDK dependency.

const LANGFUSE_BASE_URL   = process.env.LANGFUSE_BASE_URL   ?? 'https://cloud.langfuse.com'
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? ''
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? ''

interface LangfusePayload {
  traceId:         string
  taskId:          string
  agentName:       string
  model:           string
  provider:        string
  systemPrompt:    string
  userPrompt:      string
  rawResponse:     string | null
  success:         boolean
  errorMessage:    string | null
  latencyMs:       number
  promptTokens:    number | null
  completionTokens: number | null
  parseSuccess:    boolean
  parsedTransition: string | null
}

async function forwardToLangfuse(payload: LangfusePayload): Promise<void> {
  if (!LANGFUSE_SECRET_KEY || !LANGFUSE_PUBLIC_KEY) return

  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')

  const body = {
    batch: [
      {
        id:        `${payload.traceId}-trace`,
        type:      'trace-create',
        timestamp: new Date().toISOString(),
        body: {
          id:   payload.traceId,
          name: `agent-run/${payload.agentName}`,
          metadata: { taskId: payload.taskId, agentName: payload.agentName, provider: payload.provider },
          tags: ['agenttask', payload.agentName, payload.provider],
        },
      },
      {
        id:        `${payload.traceId}-gen`,
        type:      'generation-create',
        timestamp: new Date().toISOString(),
        body: {
          traceId: payload.traceId,
          name:    'llm-call',
          model:   payload.model,
          input: { systemPrompt: payload.systemPrompt, userPrompt: payload.userPrompt },
          output:  payload.rawResponse,
          usage:   payload.promptTokens != null
            ? { input: payload.promptTokens, output: payload.completionTokens ?? 0 }
            : undefined,
          latency:       payload.latencyMs / 1000,
          level:         payload.success ? 'DEFAULT' : 'ERROR',
          statusMessage: payload.errorMessage ?? undefined,
          metadata: { parseSuccess: payload.parseSuccess, parsedTransition: payload.parsedTransition },
        },
      },
    ],
  }

  try {
    const res = await fetch(`${LANGFUSE_BASE_URL}/api/public/ingestion`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(5_000),
    })
    if (!res.ok) console.warn(`[langfuse] Ingestion failed: ${res.status}`)
  } catch (err) {
    console.warn('[langfuse] Forward error:', err)
  }
}

// Start background watcher on first agent import (server-side singleton)
startTimeoutWatcher()

interface AgentOutput {
  transitionName: string
  comment?:       string
  result?:        unknown
}

interface WorkspaceInfo {
  workspaceType?: string | null
  workspacePath?: string | null
  githubRepo?:    string | null
  githubBranch?:  string | null
}

function buildWorkspaceSection(ws: WorkspaceInfo): string {
  if (!ws.workspaceType) return ''
  if (ws.workspaceType === 'local' && ws.workspacePath) {
    return `## Workspace (local)
Path: ${ws.workspacePath}
You can read and write files in this directory. Use the path as the working directory for any file operations.

`
  }
  if (ws.workspaceType === 'github' && ws.githubRepo) {
    return `## Workspace (GitHub)
Repository: ${ws.githubRepo}
Branch: ${ws.githubBranch ?? 'main'}
Clone URL: https://github.com/${ws.githubRepo}.git
You may reference files, commits, and pull requests in this repository.

`
  }
  return ''
}

function buildPrompt(task: {
  id: string
  title: string
  description?: string | null
  context:      unknown
  result?:      unknown
  state:        { name: string; label: string; completionTransitionName?: string | null; stateInstructions?: string | null }
  workspace:    WorkspaceInfo
}, transitions: { name: string; label: string; toState: { label: string } }[], envVarsSection = ''): string {
  const transitionList = transitions.map(t =>
    `  - "${t.name}" → moves task to "${t.toState.label}"`
  ).join('\n')

  return `You are an AI agent. Your job is to complete the following task and report the outcome.

## Task
ID: ${task.id}
Title: ${task.title}
${task.description ? `Description: ${task.description}\n` : ''}
Current state: ${task.state.label}

## Context (structured data)
\`\`\`json
${JSON.stringify(task.context, null, 2)}
\`\`\`

${task.result ? `## Previous result\n\`\`\`json\n${JSON.stringify(task.result, null, 2)}\n\`\`\`\n` : ''}${buildWorkspaceSection(task.workspace)}
## Available transitions
${transitionList || '  (none — task may be in a terminal state)'}

${task.state.completionTransitionName
  ? `The preferred completion transition is: "${task.state.completionTransitionName}"`
  : ''}
${envVarsSection}${task.state.stateInstructions ? `## State-specific instructions\n${task.state.stateInstructions}\n\n` : ''}## Instructions
Perform the task described above. Then respond with a JSON object only — no prose, no markdown fences:

{
  "transitionName": "<one of the transition names above>",
  "comment": "<brief summary of what you did>",
  "result": { <any structured output you want to store> }
}

If you cannot complete the task, use the most appropriate failure/rejection transition and explain in "comment".`
}

function parseOutput(raw: string): AgentOutput | null {
  // Strip markdown fences if the model wrapped it
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(clean)
    if (typeof obj.transitionName === 'string') return obj as AgentOutput
    return null
  } catch {
    // Try to extract JSON from somewhere in the response
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const obj = JSON.parse(match[0])
        if (typeof obj.transitionName === 'string') return obj as AgentOutput
      } catch { /* ignore */ }
    }
    return null
  }
}

// ─── Error reporter ───────────────────────────────────────────────────────────

async function getWorkflowId(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { workflowId: true } })
  return t?.workflowId ?? ''
}

async function recordAgentError(taskId: string, agentName: string, message: string): Promise<void> {
  try {
    const workflowId = await getWorkflowId(taskId)
    await prisma.taskEvent.create({
      data: {
        taskId,
        actor:     agentName,
        actorType: 'agent',
        comment:   `⚠️ Agent error: ${message}`,
        metadata:  { error: true },
      },
    })
    emitTaskEvent({ type: 'task_updated', taskId, taskTitle: '', actor: agentName, actorType: 'agent', workflowId })
  } catch (err) {
    console.error('[agent-runner] Failed to record error event:', err)
  }
}

export async function runAgent(taskId: string, agentName: string): Promise<void> {
  console.log(`[agent-runner] Starting agent "${agentName}" for task ${taskId}`)
  const workflowId = await getWorkflowId(taskId)
  emitTaskEvent({ type: 'task_processing', taskId, taskTitle: '', actor: agentName, actorType: 'agent', workflowId })

  // Record "processing started" so the timeout watcher can detect stuck tasks
  await prisma.taskEvent.create({
    data: {
      taskId,
      actor:     agentName,
      actorType: 'agent',
      comment:   '⚙ Agent processing…',
      metadata:  { action: 'processing_started' },
    },
  }).catch(() => { /* non-critical */ })

  // Load agent config + assigned skills + env vars
  const agentConfig = await prisma.agent.findFirst({
    where: { name: agentName, enabled: true },
    include: {
      skills:  { include: { skill: true } },
      envVars: { include: { envVar: true } },
    },
  })
  if (!agentConfig) {
    const msg = `No enabled agent config found for name "${agentName}"`
    console.warn(`[agent-runner] ${msg} — skipping auto-invoke`)
    await recordAgentError(taskId, agentName, msg)
    return
  }

  // Load full task with state + workflow workspace + outgoing transitions
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      state: true,
      workflow: {
        include: {
          transitions: { include: { toState: true } },
        },
      },
    },
  })
  if (!task) {
    console.warn(`[agent-runner] Task ${taskId} not found`)
    return
  }

  const transitions = task.workflow.transitions.filter(
    t => t.fromStateId === task.stateId && t.allowedRoles.includes('agent')
  )

  // Build skills section (appended to system prompt)
  const skillsSection = agentConfig.skills.length > 0
    ? '\n\n---\n## Skills\n\n' + agentConfig.skills.map(as => as.skill.content).join('\n\n---\n\n')
    : ''

  // Build env vars section (appended to user prompt)
  const envVarsSection = agentConfig.envVars.length > 0
    ? '\n## Available credentials\n' +
      agentConfig.envVars.map(ae =>
        `  - ${ae.envVar.key}${ae.envVar.description ? ` — ${ae.envVar.description}` : ''}: ${ae.envVar.value}`
      ).join('\n') + '\n'
    : ''

  // Build messages
  const systemPrompt = (agentConfig.systemPrompt?.trim() ||
    'You are a task execution agent. Complete assigned tasks and respond in the requested JSON format only.')
    + skillsSection

  const userPrompt = buildPrompt(
    {
      id:          task.id,
      title:       task.title,
      description: task.description,
      context:     task.context,
      result:      task.result ?? undefined,
      state: {
        name:                     task.state.name,
        label:                    task.state.label,
        completionTransitionName: task.state.completionTransitionName,
        stateInstructions:        task.state.stateInstructions,
      },
      workspace: {
        workspaceType: task.workflow.workspaceType,
        workspacePath: task.workflow.workspacePath,
        githubRepo:    task.workflow.githubRepo,
        githubBranch:  task.workflow.githubBranch,
      },
    },
    transitions,
    envVarsSection
  )

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user'   as const, content: userPrompt   },
  ]

  // Resolve LLM credentials: use linked AI provider if set, otherwise fall back to agent's own fields
  let llmProvider = agentConfig.provider
  let llmBaseUrl  = agentConfig.baseUrl ?? ''
  let llmApiKey   = agentConfig.apiKey
  let llmModel    = agentConfig.model ?? ''

  if (agentConfig.aiProviderId) {
    const aiProv = await prisma.aiProvider.findUnique({ where: { id: agentConfig.aiProviderId } })
    if (aiProv) {
      llmProvider = aiProv.provider
      llmBaseUrl  = aiProv.baseUrl ?? ''
      llmApiKey   = aiProv.apiKey
      llmModel    = aiProv.model
    }
  }

  // Call LLM
  const agentCfg = {
    provider:    llmProvider,
    baseUrl:     llmBaseUrl,
    apiKey:      llmApiKey,
    model:       llmModel,
    maxTokens:   agentConfig.maxTokens,
    temperature: agentConfig.temperature,
    extraConfig: {
      ...(agentConfig.extraConfig as Record<string, unknown>),
      workspacePath: task.workflow.workspacePath || undefined,
    },
  }

  // ── Agentic loop path (when agent has tools configured) ─────────────────────
  const agentTools: string[] = Array.isArray(agentConfig.tools) ? agentConfig.tools : []
  console.log(`[agent-runner] Agent "${agentName}" tools: [${agentTools.join(', ')}], maxIterations: ${agentConfig.maxIterations ?? 20}`)

  if (agentTools.length > 0) {
    console.log(`[agent-runner] Using agentic loop with tools: [${agentTools.join(', ')}]`)

    const context = {
      taskId:        taskId,
      workspacePath: task.workflow.workspacePath ?? null,
      envVars:       Object.fromEntries(
        agentConfig.envVars.map(ae => [ae.envVar.key, ae.envVar.value])
      ),
    }

    const loopResult = await agenticLoop(
      agentCfg,
      messages,
      agentTools,
      context,
      {
        maxIterations: agentConfig.maxIterations,
        taskId,
        agentName,
        provider:      llmProvider,
        model:         llmModel,
        systemPrompt:  systemPrompt,
      },
    )

    console.log(`[agent-runner] Loop finished: ${loopResult.iterations} iteration(s), ${loopResult.totalLatencyMs}ms`)

    if (!loopResult.output) {
      const msg = loopResult.lastError ?? 'Agentic loop returned no output'
      console.error(`[agent-runner] ${msg}`)
      await recordAgentError(taskId, agentName, msg)
      return
    }

    // Re-fetch task state guard
    const freshTask2 = await prisma.task.findUnique({ where: { id: taskId }, select: { stateId: true } })
    if (!freshTask2 || freshTask2.stateId !== task.stateId) {
      console.warn(`[agent-runner] Task ${taskId} state changed while loop ran — skipping transition`)
      return
    }

    try {
      const transitionResult = await executeTransition(
        taskId,
        loopResult.output.transitionName,
        agentName,
        'agent',
        loopResult.output.comment,
        loopResult.output.result,
        {
          llmCallId:   loopResult.lastLlmCallId,
          model:       llmModel,
          provider:    llmProvider,
          latencyMs:   loopResult.totalLatencyMs,
          parseSuccess: true,
        },
      )
      if (loopResult.lastLlmCallId && transitionResult.event?.id) {
        await prisma.llmCall.update({
          where: { id: loopResult.lastLlmCallId },
          data:  { taskEventId: transitionResult.event.id },
        }).catch(() => {})
      }
      console.log(`[agent-runner] Transition "${loopResult.output.transitionName}" executed for task ${taskId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[agent-runner] Transition failed:`, err)
      await recordAgentError(taskId, agentName, `Transition "${loopResult.output.transitionName}" failed: ${msg}`)
    }
    return
  }

  // ── Single-shot path (no tools) ───────────────────────────────────────────
  let response: Awaited<ReturnType<typeof callAgent>> | undefined
  let llmCallId: string | null = null
  const t0 = Date.now()

  try {
    response = await callAgent(agentCfg, messages)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[agent-runner] LLM call failed for agent "${agentName}":`, err)

    // Uložit chybný LlmCall
    const systemPromptStr = messages.find(m => m.role === 'system')?.content ?? ''
    const userPromptStr   = messages.find(m => m.role === 'user')?.content ?? ''
    const failedLatency   = Date.now() - t0

    const failedCall = await prisma.llmCall.create({
      data: {
        taskId,
        agentName,
        provider:     llmProvider,
        model:        llmModel,
        systemPrompt: systemPromptStr,
        userPrompt:   userPromptStr,
        latencyMs:    failedLatency,
        success:      false,
        errorMessage: msg,
        parseSuccess: false,
      },
    }).catch(() => null)
    llmCallId = failedCall?.id ?? null

    forwardToLangfuse({
      traceId:         llmCallId ?? `err-${taskId}`,
      taskId,          agentName,
      model:           llmModel,    provider: llmProvider,
      systemPrompt:    systemPromptStr, userPrompt: userPromptStr,
      rawResponse:     null,        success: false,
      errorMessage:    msg,         latencyMs: failedLatency,
      promptTokens:    null,        completionTokens: null,
      parseSuccess:    false,       parsedTransition: null,
    }).catch(() => {})

    await recordAgentError(taskId, agentName, `LLM call failed: ${msg}`)
    return
  }

  console.log(`[agent-runner] Raw LLM response:`, response.content.slice(0, 300))

  // Parse output
  const output = parseOutput(response.content)
  const parseSuccess = output !== null

  const systemPromptStr = messages.find(m => m.role === 'system')?.content ?? ''
  const userPromptStr   = messages.find(m => m.role === 'user')?.content ?? ''

  // Uložit LlmCall
  const llmCallRecord = await prisma.llmCall.create({
    data: {
      taskId,
      agentName,
      provider:         llmProvider,
      model:            llmModel,
      systemPrompt:     systemPromptStr,
      userPrompt:       userPromptStr,
      rawResponse:      response.content,
      latencyMs:        response.latencyMs,
      success:          true,
      promptTokens:     response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
      parseSuccess,
      parsedTransition: output?.transitionName ?? null,
    },
  }).catch(() => null)
  llmCallId = llmCallRecord?.id ?? null

  forwardToLangfuse({
    traceId:          llmCallId ?? `ok-${taskId}`,
    taskId,           agentName,
    model:            llmModel,     provider: llmProvider,
    systemPrompt:     systemPromptStr, userPrompt: userPromptStr,
    rawResponse:      response.content, success: true,
    errorMessage:     null,         latencyMs: response.latencyMs,
    promptTokens:     response.usage?.prompt_tokens ?? null,
    completionTokens: response.usage?.completion_tokens ?? null,
    parseSuccess,     parsedTransition: output?.transitionName ?? null,
  }).catch(() => {})

  if (!output) {
    const preview = response.content.slice(0, 200)
    console.error(`[agent-runner] Could not parse JSON from LLM response: ${preview}`)
    await recordAgentError(taskId, agentName, `Could not parse JSON response. Raw output: ${preview}`)
    return
  }

  // Re-fetch task to make sure it's still in the same state (guard against race)
  const freshTask = await prisma.task.findUnique({ where: { id: taskId }, select: { stateId: true } })
  if (!freshTask || freshTask.stateId !== task.stateId) {
    console.warn(`[agent-runner] Task ${taskId} state changed while agent was running — skipping transition`)
    return
  }

  // Execute transition s LLM metadaty
  try {
    const transitionResult = await executeTransition(
      taskId,
      output.transitionName,
      agentName,
      'agent',
      output.comment,
      output.result,
      {
        llmCallId,
        model:           llmModel,
        provider:        llmProvider,
        latencyMs:       response.latencyMs,
        promptTokens:    response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        parseSuccess,
      },
    )

    // Zpětně doplnit taskEventId do LlmCall
    if (llmCallRecord?.id && transitionResult.event?.id) {
      await prisma.llmCall.update({
        where: { id: llmCallRecord.id },
        data:  { taskEventId: transitionResult.event.id },
      }).catch(() => {})
    }

    console.log(`[agent-runner] Transition "${output.transitionName}" executed for task ${taskId}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[agent-runner] Transition failed:`, err)
    await recordAgentError(taskId, agentName, `Transition "${output.transitionName}" failed: ${msg}`)
  }
}
