/**
 * Agentic loop — drives a multi-turn tool-calling conversation until the
 * agent returns a final JSON transition response or maxIterations is hit.
 *
 * Message history is maintained in provider-native format so each iteration
 * can include tool calls + results in the exact shape each API expects.
 */

import { prisma } from '../prisma'
import {
  AgentConfig,
  ChatMessage,
  ToolAwareResponse,
  callAnthropicWithTools,
  callOpenAICompatWithTools,
  callOllamaWithTools,
} from '../agent-connector'
import {
  ToolDefinition,
  ToolContext,
  collectToolDefinitions,
  setupProviders,
  teardownProviders,
  executeTool,
  toAnthropicTools,
  toOpenAITools,
} from './registry'
import { ensureProvidersRegistered } from './index'

export interface AgentOutput {
  transitionName: string
  comment?:       string
  result?:        unknown
}

export interface LoopResult {
  output:          AgentOutput | null
  iterations:      number
  totalLatencyMs:  number
  lastError?:      string
  lastLlmCallId?:  string | null
}

// ─── JSON parse helper (same as agent-runner, replicated to avoid circular import) ──

function parseOutput(raw: string): AgentOutput | null {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(clean)
    if (typeof obj.transitionName === 'string') return obj as AgentOutput
    return null
  } catch {
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

// ─── Per-provider tool caller ─────────────────────────────────────────────────

function callWithTools(
  cfg:      AgentConfig,
  messages: unknown[],
  tools:    unknown[],
): Promise<ToolAwareResponse> {
  if (cfg.provider === 'anthropic') return callAnthropicWithTools(cfg, messages, tools)
  if (cfg.provider === 'ollama')    return callOllamaWithTools(cfg, messages, tools)
  return callOpenAICompatWithTools(cfg, messages, tools)
}

// ─── Append tool results to history in provider-native format ─────────────────

// If a tool result contains a screenshot (base64 PNG), format it as an image
// content block so the LLM can visually inspect the page.
function buildToolResultContent(
  result: unknown,
  isAnthropic: boolean,
): unknown {
  const r = result as Record<string, unknown>
  const output = r?.output as Record<string, unknown> | undefined

  if (
    isAnthropic &&
    output?.base64 &&
    typeof output.base64 === 'string' &&
    output.mimeType === 'image/png'
  ) {
    // Anthropic supports multi-content tool_result: text + image
    return [
      { type: 'text',  text: `Screenshot taken. URL: ${output.url ?? 'unknown'}` },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: output.base64 } },
    ]
  }

  // Default: serialize as JSON string
  return JSON.stringify(result)
}

function appendToolResults(
  messages:    unknown[],
  assistantRaw: unknown,
  toolResults: Array<{ id: string; name: string; result: unknown }>,
  isAnthropic:  boolean,
): void {
  messages.push(assistantRaw)

  if (isAnthropic) {
    // Anthropic: one user message with array of tool_result content blocks
    messages.push({
      role: 'user',
      content: toolResults.map(tr => ({
        type:        'tool_result',
        tool_use_id: tr.id,
        content:     buildToolResultContent(tr.result, true),
      })),
    })
  } else {
    // OpenAI / Ollama: one tool message per result
    for (const tr of toolResults) {
      messages.push({
        role:         'tool',
        tool_call_id: tr.id,
        name:         tr.name,
        content:      JSON.stringify(tr.result),  // OpenAI doesn't support image in tool results
      })
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function agenticLoop(
  agentCfg:     AgentConfig,
  initialMessages: ChatMessage[],
  providerNames:   string[],
  context:         ToolContext,
  opts: {
    maxIterations: number
    taskId:        string
    agentName:     string
    provider:      string
    model:         string
    systemPrompt:  string
  },
): Promise<LoopResult> {
  ensureProvidersRegistered()

  const toolDefs: ToolDefinition[] = collectToolDefinitions(providerNames)
  const isAnthropic = agentCfg.provider === 'anthropic'
  const formattedTools = isAnthropic ? toAnthropicTools(toolDefs) : toOpenAITools(toolDefs)

  // Build provider-native initial message history
  const rawMessages: unknown[] = initialMessages.map(m => ({ role: m.role, content: m.content }))

  let totalLatencyMs  = 0
  let iterations      = 0
  let lastLlmCallId: string | null = null

  try {
    await setupProviders(providerNames, context)
  } catch (setupErr) {
    const msg = setupErr instanceof Error ? setupErr.message : String(setupErr)
    console.error('[agentic-loop] Provider setup failed:', msg)
    return { output: null, iterations: 0, totalLatencyMs: 0, lastError: `Tool provider setup failed: ${msg}`, lastLlmCallId: null }
  }

  try {
    while (iterations < opts.maxIterations) {
      iterations++

      // ── LLM call ─────────────────────────────────────────────────────────
      let resp: ToolAwareResponse
      try {
        resp = await callWithTools(agentCfg, rawMessages, formattedTools)
      } catch (callErr) {
        const errMsg = callErr instanceof Error ? callErr.message : String(callErr)

        const rec = await prisma.llmCall.create({
          data: {
            taskId:       opts.taskId,
            agentName:    opts.agentName,
            provider:     opts.provider,
            model:        opts.model,
            systemPrompt: opts.systemPrompt,
            userPrompt:   `[iteration ${iterations}]`,
            latencyMs:    0,
            success:      false,
            errorMessage: errMsg,
            parseSuccess: false,
            iteration:    iterations,
          },
        }).catch(() => null)
        lastLlmCallId = rec?.id ?? null

        return { output: null, iterations, totalLatencyMs, lastError: errMsg, lastLlmCallId }
      }

      totalLatencyMs += resp.latencyMs

      // ── Log this iteration ────────────────────────────────────────────────
      const hasToolCalls   = resp.toolCalls.length > 0
      const parseSuccess   = hasToolCalls || resp.textContent.length > 0

      const rec = await prisma.llmCall.create({
        data: {
          taskId:           opts.taskId,
          agentName:        opts.agentName,
          provider:         opts.provider,
          model:            opts.model,
          systemPrompt:     opts.systemPrompt,
          userPrompt:       `[iteration ${iterations}]`,
          rawResponse:      resp.rawContent,
          latencyMs:        resp.latencyMs,
          success:          true,
          promptTokens:     resp.usage?.prompt_tokens     ?? null,
          completionTokens: resp.usage?.completion_tokens ?? null,
          parseSuccess,
          parsedTransition: hasToolCalls ? null : (parseOutput(resp.textContent)?.transitionName ?? null),
          iteration:        iterations,
          toolCallsJson:    hasToolCalls ? JSON.stringify(resp.toolCalls) : null,
        },
      }).catch(() => null)
      lastLlmCallId = rec?.id ?? null

      // ── Execute tool calls if present ─────────────────────────────────────
      if (hasToolCalls) {
        console.log(`[agentic-loop] Iteration ${iterations}: executing ${resp.toolCalls.length} tool(s)`)

        const toolResults = await Promise.all(
          resp.toolCalls.map(async tc => {
            const result = await executeTool(tc.name, tc.args, providerNames, context)
            console.log(`[agentic-loop]   tool ${tc.name}: ${result.success ? 'ok' : result.error}`)
            return { id: tc.id, name: tc.name, result }
          })
        )

        appendToolResults(rawMessages, resp.assistantRaw, toolResults, isAnthropic)
        continue
      }

      // ── Final text response ───────────────────────────────────────────────
      const output = parseOutput(resp.textContent)
      return { output, iterations, totalLatencyMs, lastLlmCallId }
    }

    return {
      output:         null,
      iterations,
      totalLatencyMs,
      lastError:      `Max iterations (${opts.maxIterations}) reached without a final response`,
      lastLlmCallId,
    }
  } finally {
    await teardownProviders(providerNames, context)
  }
}
