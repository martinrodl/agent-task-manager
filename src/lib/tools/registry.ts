import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

// ─── Registry ─────────────────────────────────────────────────────────────────

const providers = new Map<string, ToolProvider>()

export function registerProvider(p: ToolProvider): void {
  providers.set(p.name, p)
}

export function getProvider(name: string): ToolProvider | undefined {
  return providers.get(name)
}

export function getProviders(names: string[]): ToolProvider[] {
  return names.flatMap(n => {
    const p = providers.get(n)
    if (!p) { console.warn(`[tools] Unknown provider: ${n}`); return [] }
    return [p]
  })
}

// Flat list of all ToolDefinitions for given provider names
export function collectToolDefinitions(providerNames: string[]): ToolDefinition[] {
  return getProviders(providerNames).flatMap(p => p.tools)
}

// Execute a single tool call — dispatches to the provider that owns that tool name
export async function executeTool(
  toolName: string,
  args: unknown,
  providerNames: string[],
  context: ToolContext,
): Promise<ToolResult> {
  const ps = getProviders(providerNames)
  for (const p of ps) {
    if (p.tools.some(t => t.name === toolName)) {
      return p.execute(toolName, args, context)
    }
  }
  return { success: false, output: null, error: `No provider handles tool: ${toolName}` }
}

// Lifecycle
export async function setupProviders(names: string[], context: ToolContext): Promise<void> {
  for (const p of getProviders(names)) {
    if (p.setup) await p.setup(context)
  }
}

export async function teardownProviders(names: string[], context: ToolContext): Promise<void> {
  for (const p of getProviders(names)) {
    if (p.teardown) {
      await p.teardown(context).catch(err =>
        console.error(`[tools] teardown failed for ${p.name}:`, err)
      )
    }
  }
}

// Anthropic tool format
export function toAnthropicTools(defs: ToolDefinition[]) {
  return defs.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.parameters,
  }))
}

// OpenAI / Ollama / OpenRouter tool format
export function toOpenAITools(defs: ToolDefinition[]) {
  return defs.map(t => ({
    type:     'function' as const,
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.parameters,
    },
  }))
}

export type { ToolProvider, ToolDefinition, ToolContext, ToolResult }
