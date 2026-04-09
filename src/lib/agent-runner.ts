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
import { executeTransition } from './state-machine'

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
  state:        { name: string; label: string; completionTransitionName?: string | null }
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
${envVarsSection}
## Instructions
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

export async function runAgent(taskId: string, agentName: string): Promise<void> {
  console.log(`[agent-runner] Starting agent "${agentName}" for task ${taskId}`)

  // Load agent config + assigned skills + env vars
  const agentConfig = await prisma.agent.findFirst({
    where: { name: agentName, enabled: true },
    include: {
      skills:  { include: { skill: true } },
      envVars: { include: { envVar: true } },
    },
  })
  if (!agentConfig) {
    console.warn(`[agent-runner] No enabled agent config found for name "${agentName}" — skipping auto-invoke`)
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
  if (!task) { console.warn(`[agent-runner] Task ${taskId} not found`); return }

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

  // Call LLM
  let response
  try {
    response = await callAgent(
      {
        provider:    agentConfig.provider,
        baseUrl:     agentConfig.baseUrl,
        apiKey:      agentConfig.apiKey,
        model:       agentConfig.model,
        maxTokens:   agentConfig.maxTokens,
        temperature: agentConfig.temperature,
        extraConfig: {
          ...(agentConfig.extraConfig as Record<string, unknown>),
          // Pass workspace path so claude-code subprocess runs in the right directory
          workspacePath: task.workflow.workspacePath || undefined,
        },
      },
      messages
    )
  } catch (err) {
    console.error(`[agent-runner] LLM call failed for agent "${agentName}":`, err)
    return
  }

  console.log(`[agent-runner] Raw LLM response:`, response.content.slice(0, 300))

  // Parse output
  const output = parseOutput(response.content)
  if (!output) {
    console.error(`[agent-runner] Could not parse JSON from LLM response: ${response.content.slice(0, 300)}`)
    return
  }

  // Re-fetch task to make sure it's still in the same state (guard against race)
  const freshTask = await prisma.task.findUnique({ where: { id: taskId }, select: { stateId: true } })
  if (!freshTask || freshTask.stateId !== task.stateId) {
    console.warn(`[agent-runner] Task ${taskId} state changed while agent was running — skipping transition`)
    return
  }

  // Execute transition
  try {
    await executeTransition(
      taskId,
      output.transitionName,
      agentName,
      'agent',
      output.comment,
      output.result,
    )
    console.log(`[agent-runner] Transition "${output.transitionName}" executed for task ${taskId}`)
  } catch (err) {
    console.error(`[agent-runner] Transition failed:`, err)
  }
}
