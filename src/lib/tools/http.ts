import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

export class HttpProvider implements ToolProvider {
  readonly name = 'http'

  readonly tools: ToolDefinition[] = [
    {
      name:        'http_request',
      description: 'Send an HTTP request and return status code and response body.',
      parameters: {
        type: 'object',
        properties: {
          method:    { type: 'string', enum: ['GET','POST','PUT','PATCH','DELETE','HEAD'], description: 'HTTP method (default: GET)' },
          url:       { type: 'string', description: 'Full URL including protocol' },
          headers:   { type: 'object', description: 'Request headers as key-value pairs', additionalProperties: { type: 'string' } },
          body:      { type: 'string', description: 'Request body as string (JSON.stringify if sending JSON)' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['url'],
      },
    },
  ]

  async execute(_toolName: string, args: unknown, _context: ToolContext): Promise<ToolResult> {
    const {
      method = 'GET',
      url,
      headers = {},
      body,
      timeoutMs = 30_000,
    } = args as { method?: string; url: string; headers?: Record<string,string>; body?: string; timeoutMs?: number }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body:    body ?? undefined,
        signal:  AbortSignal.timeout(timeoutMs),
      })
      const text = await res.text()
      let parsed: unknown = text
      try { parsed = JSON.parse(text) } catch { /* keep raw text */ }

      return {
        success: res.ok,
        output:  { status: res.status, headers: Object.fromEntries(res.headers), body: parsed },
        error:   res.ok ? undefined : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { success: false, output: null, error: String(err) }
    }
  }
}
