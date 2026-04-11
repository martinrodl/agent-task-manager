/**
 * LLM provider connectors — all normalised to OpenAI chat completions format.
 *
 * Supported providers:
 *   anthropic   — api.anthropic.com (native Anthropic API)
 *   openai      — api.openai.com  (or any OpenAI-compatible endpoint)
 *   azure       — Azure AI Foundry / Azure OpenAI
 *   openrouter  — openrouter.ai
 *   ollama      — local Ollama
 *   lmstudio    — LM Studio local server
 *   webui       — Open WebUI
 *   custom      — any OpenAI-compatible endpoint (explicit baseUrl)
 *   claude-code — Claude Code CLI subprocess (requires `claude` in PATH)
 */

import { spawn } from 'child_process'

export interface AgentConfig {
  provider:    string
  baseUrl:     string
  apiKey?:     string | null
  model:       string
  maxTokens:   number
  temperature: number
  extraConfig: Record<string, unknown>   // e.g. { apiVersion: "2024-02-01" }
}

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  content:   string
  latencyMs: number
  usage?:    { prompt_tokens: number; completion_tokens: number }
}

// ─── Per-provider URL + headers ──────────────────────────────────────────────

// Default base URLs for known providers — used when baseUrl is not set
const DEFAULT_BASE: Record<string, string> = {
  anthropic:  'https://api.anthropic.com',
  openai:     'https://api.openai.com',
  openrouter: 'https://openrouter.ai',
}

// Detect if a key was accidentally stored as the masked display value
function isMasked(key: string | null | undefined): boolean {
  return !!(key && /^[•*]{4,}$/.test(key))
}

function resolveEndpoint(cfg: AgentConfig): { url: string; headers: Record<string, string> } {
  const raw  = cfg.baseUrl?.trim() || DEFAULT_BASE[cfg.provider] || ''
  const base = raw.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (isMasked(cfg.apiKey)) {
    throw new Error(`API key for provider "${cfg.provider}" appears to be a masked placeholder. Go to Settings → AI Providers and re-enter the real key.`)
  }

  switch (cfg.provider) {
    case 'azure': {
      const apiVersion = (cfg.extraConfig.apiVersion as string) ?? '2024-02-01'
      const url = `${base}/openai/deployments/${cfg.model}/chat/completions?api-version=${apiVersion}`
      if (cfg.apiKey) headers['api-key'] = cfg.apiKey
      return { url, headers }
    }

    case 'openrouter':
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
      headers['HTTP-Referer'] = 'https://agenttask'
      headers['X-Title'] = 'AgentTask'
      return { url: `${base}/api/v1/chat/completions`, headers }

    case 'ollama':
      return { url: `${base}/api/chat`, headers }

    case 'openai':
    case 'lmstudio':
    case 'webui':
    case 'custom':
    default:
      if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
      return { url: `${base}/v1/chat/completions`, headers }
  }
}

// ─── Ollama native format ─────────────────────────────────────────────────────

async function callOllama(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const { url, headers } = resolveEndpoint(cfg)
  const t0 = Date.now()

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model:    cfg.model,
      messages,
      stream:   false,
      options: { temperature: cfg.temperature, num_predict: cfg.maxTokens },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Ollama error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return {
    content:   data.message?.content ?? '',
    latencyMs: Date.now() - t0,
    usage: data.prompt_eval_count !== undefined
      ? { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count ?? 0 }
      : undefined,
  }
}

// ─── OpenAI-compatible (covers openai/azure/openrouter/lmstudio/webui/custom) ─

async function callOpenAICompat(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const { url, headers } = resolveEndpoint(cfg)
  const t0 = Date.now()

  const body: Record<string, unknown> = {
    messages,
    max_tokens:  cfg.maxTokens,
    temperature: cfg.temperature,
  }

  // Azure uses deployment name in URL, not body; others need model in body
  if (cfg.provider !== 'azure') {
    body.model = cfg.model
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`LLM error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return {
    content:   data.choices?.[0]?.message?.content ?? '',
    latencyMs: Date.now() - t0,
    usage:     data.usage,
  }
}

// ─── Provider metadata (for UI) ───────────────────────────────────────────────

// ─── Anthropic native format ──────────────────────────────────────────────────

async function callAnthropic(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const baseUrl = cfg.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com'
  const systemMsg = messages.find(m => m.role === 'system')?.content
  const chatMsgs  = messages.filter(m => m.role !== 'system')
  const t0 = Date.now()

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: cfg.maxTokens,
      ...(systemMsg ? { system: systemMsg } : {}),
      messages:   chatMsgs.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return {
    content:   data.content?.[0]?.text ?? '',
    latencyMs: Date.now() - t0,
    usage: data.usage
      ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens }
      : undefined,
  }
}

// ─── Claude Code CLI subprocess ──────────────────────────────────────────────
//
// Spawns `claude --print` and pipes the full prompt via stdin.
// The workspace path (if set on the workflow) becomes the cwd, so Claude Code
// can read/write files in that directory.
//
// baseUrl field is repurposed as the path to the claude binary (default: "claude").
// extraConfig.workspacePath is set automatically by agent-runner.

function callClaudeCode(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const systemMsg  = messages.find(m => m.role === 'system')?.content ?? ''
  const userMsgs   = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n')
  const fullPrompt = [systemMsg, userMsgs].filter(Boolean).join('\n\n---\n\n')

  const claudeBin  = cfg.baseUrl?.trim() || 'claude'
  const cwd        = (cfg.extraConfig?.workspacePath as string | undefined) || process.cwd()
  const t0         = Date.now()

  const args: string[] = ['--print']
  if (cfg.model && cfg.model !== 'default') args.push('--model', cfg.model)

  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => { child.kill(); reject(new Error('claude-code timeout (10 min)')) }, 10 * 60 * 1000)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`))
      else resolve({ content: stdout.trim(), latencyMs: Date.now() - t0 })
    })

    child.stdin.write(fullPrompt)
    child.stdin.end()
  })
}

// ─── Public entrypoint ────────────────────────────────────────────────────────

export async function callAgent(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  if (cfg.provider === 'claude-code') return callClaudeCode(cfg, messages)
  if (cfg.provider === 'ollama')      return callOllama(cfg, messages)
  if (cfg.provider === 'anthropic')   return callAnthropic(cfg, messages)
  return callOpenAICompat(cfg, messages)
}

// ─── Tool-calling types ───────────────────────────────────────────────────────

export interface ToolCallRequest {
  id:   string
  name: string
  args: unknown
}

/**
 * Response from a tool-aware LLM call.
 * Either toolCalls is non-empty (model wants to invoke tools) OR textContent is
 * the final assistant answer — never both in the same response.
 */
export interface ToolAwareResponse {
  textContent:  string
  toolCalls:    ToolCallRequest[]
  stopReason:   string
  latencyMs:    number
  usage?:       { prompt_tokens: number; completion_tokens: number }
  rawContent:   string    // serialized for LlmCall logging
  assistantRaw: unknown   // provider-native message to append to history
}

// ─── Anthropic with tools ─────────────────────────────────────────────────────
// messages: provider-native (may include system role + previous tool rounds)
// tools:    result of toAnthropicTools()

export async function callAnthropicWithTools(
  cfg:      AgentConfig,
  messages: unknown[],
  tools:    unknown[],
): Promise<ToolAwareResponse> {
  const baseUrl = cfg.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com'
  type Msg = { role: string; content: unknown }
  const typed = messages as Msg[]
  const systemMsg = typed.find(m => m.role === 'system')?.content
  const chatMsgs  = typed.filter(m => m.role !== 'system')
  const t0 = Date.now()

  const body: Record<string, unknown> = {
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
    tools,
    messages:   chatMsgs,
  }
  if (systemMsg) body.system = systemMsg

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic error ${res.status}: ${text}`)
  }

  type ContentBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown }
  const data = await res.json() as {
    content:     ContentBlock[]
    stop_reason: string
    usage?:      { input_tokens: number; output_tokens: number }
  }

  const latencyMs  = Date.now() - t0
  const stopReason = data.stop_reason

  const toolCalls: ToolCallRequest[] = data.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id!, name: b.name!, args: b.input }))

  const textContent = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')

  return {
    textContent,
    toolCalls,
    stopReason,
    latencyMs,
    usage: data.usage
      ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens }
      : undefined,
    rawContent:   JSON.stringify(data.content),
    assistantRaw: { role: 'assistant', content: data.content },
  }
}

// ─── OpenAI-compat with tools ─────────────────────────────────────────────────
// Works for openai / azure / openrouter / lmstudio / webui / custom

export async function callOpenAICompatWithTools(
  cfg:      AgentConfig,
  messages: unknown[],
  tools:    unknown[],
): Promise<ToolAwareResponse> {
  const { url, headers } = resolveEndpoint(cfg)
  const t0 = Date.now()

  const body: Record<string, unknown> = {
    messages,
    max_tokens:  cfg.maxTokens,
    temperature: cfg.temperature,
    tools,
  }
  if (cfg.provider !== 'azure') body.model = cfg.model

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`LLM error ${res.status}: ${text}`)
  }

  type OAIToolCall = { id: string; function: { name: string; arguments: string } }
  type OAIMessage  = { role: string; content: string | null; tool_calls?: OAIToolCall[] }
  const data = await res.json() as {
    choices: Array<{ message: OAIMessage; finish_reason: string }>
    usage?:  { prompt_tokens: number; completion_tokens: number }
  }

  const latencyMs    = Date.now() - t0
  const choice       = data.choices?.[0]
  const assistantMsg = choice?.message
  const stopReason   = choice?.finish_reason ?? 'stop'

  const toolCalls: ToolCallRequest[] = (assistantMsg?.tool_calls ?? []).map(tc => ({
    id:   tc.id,
    name: tc.function.name,
    args: (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })(),
  }))

  return {
    textContent:  assistantMsg?.content ?? '',
    toolCalls,
    stopReason,
    latencyMs,
    usage:        data.usage,
    rawContent:   JSON.stringify(assistantMsg),
    assistantRaw: assistantMsg,
  }
}

// ─── Ollama with tools ────────────────────────────────────────────────────────

export async function callOllamaWithTools(
  cfg:      AgentConfig,
  messages: unknown[],
  tools:    unknown[],
): Promise<ToolAwareResponse> {
  const { url, headers } = resolveEndpoint(cfg)
  const t0 = Date.now()

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model:    cfg.model,
      messages,
      tools,
      stream:   false,
      options: { temperature: cfg.temperature, num_predict: cfg.maxTokens },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Ollama error ${res.status}: ${text}`)
  }

  type OllamaToolCall = { function: { name: string; arguments: unknown } }
  const data = await res.json() as {
    message:           { role: string; content: string; tool_calls?: OllamaToolCall[] }
    done_reason?:      string
    prompt_eval_count?: number
    eval_count?:       number
  }

  const latencyMs  = Date.now() - t0
  const msg        = data.message
  const stopReason = data.done_reason ?? 'stop'

  // Ollama doesn't provide tool call IDs
  const toolCalls: ToolCallRequest[] = (msg?.tool_calls ?? []).map((tc, i) => ({
    id:   `call_${i}`,
    name: tc.function.name,
    args: tc.function.arguments,
  }))

  return {
    textContent:  msg?.content ?? '',
    toolCalls,
    stopReason,
    latencyMs,
    usage: data.prompt_eval_count !== undefined
      ? { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count ?? 0 }
      : undefined,
    rawContent:   JSON.stringify(msg),
    assistantRaw: msg,
  }
}

// Re-export so server-side code can import from one place
export { PROVIDERS } from './providers'
