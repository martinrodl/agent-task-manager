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
  content: string
  usage?:  { prompt_tokens: number; completion_tokens: number }
}

// ─── Per-provider URL + headers ──────────────────────────────────────────────

function resolveEndpoint(cfg: AgentConfig): { url: string; headers: Record<string, string> } {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

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
      // Ollama OpenAI-compatible endpoint (no auth needed for local)
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
  return { content: data.message?.content ?? '' }
}

// ─── OpenAI-compatible (covers openai/azure/openrouter/lmstudio/webui/custom) ─

async function callOpenAICompat(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const { url, headers } = resolveEndpoint(cfg)

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
  const content = data.choices?.[0]?.message?.content ?? ''
  return {
    content,
    usage: data.usage,
  }
}

// ─── Provider metadata (for UI) ───────────────────────────────────────────────

// ─── Anthropic native format ──────────────────────────────────────────────────

async function callAnthropic(cfg: AgentConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const baseUrl = cfg.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com'
  const systemMsg = messages.find(m => m.role === 'system')?.content
  const chatMsgs  = messages.filter(m => m.role !== 'system')

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       cfg.apiKey ?? '',
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
    content: data.content?.[0]?.text ?? '',
    usage: data.usage ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens } : undefined,
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
      else resolve({ content: stdout.trim() })
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

// Re-export so server-side code can import from one place
export { PROVIDERS } from './providers'
