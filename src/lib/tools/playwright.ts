import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

// Playwright is an optional dependency — imported dynamically so the app
// starts even if playwright is not installed. Install with:
//   npm install playwright && npx playwright install chromium

// Using unknown to avoid compile-time dependency on playwright types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PwPage    = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PwBrowser = any

// Per-task browser state (singleton pages map)
const pages    = new Map<string, PwPage>()
const browsers = new Map<string, PwBrowser>()

export class PlaywrightProvider implements ToolProvider {
  readonly name = 'playwright'

  readonly tools: ToolDefinition[] = [
    {
      name:        'playwright_navigate',
      description: 'Navigate to a URL in the headless browser.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full URL to navigate to' } },
        required: ['url'],
      },
    },
    {
      name:        'playwright_click',
      description: 'Click an element on the current page by CSS selector or visible text.',
      parameters: {
        type: 'object',
        properties: {
          selector:  { type: 'string', description: 'CSS selector or text= locator' },
          timeoutMs: { type: 'number', description: 'Timeout in ms (default 10000)' },
        },
        required: ['selector'],
      },
    },
    {
      name:        'playwright_fill',
      description: 'Fill an input or textarea with a value.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input' },
          value:    { type: 'string', description: 'Value to type into the field' },
        },
        required: ['selector', 'value'],
      },
    },
    {
      name:        'playwright_screenshot',
      description: 'Take a screenshot of the current page. Returns base64-encoded PNG.',
      parameters:  { type: 'object', properties: {} },
    },
    {
      name:        'playwright_get_text',
      description: 'Get the visible text content of an element.',
      parameters: {
        type: 'object',
        properties: {
          selector:  { type: 'string', description: 'CSS selector' },
          timeoutMs: { type: 'number' },
        },
        required: ['selector'],
      },
    },
    {
      name:        'playwright_wait_for',
      description: 'Wait until an element appears on the page.',
      parameters: {
        type: 'object',
        properties: {
          selector:  { type: 'string', description: 'CSS selector to wait for' },
          timeoutMs: { type: 'number', description: 'Max wait time in ms (default 15000)' },
        },
        required: ['selector'],
      },
    },
    {
      name:        'playwright_get_url',
      description: 'Get the current page URL.',
      parameters:  { type: 'object', properties: {} },
    },
    {
      name:        'playwright_evaluate',
      description: 'Evaluate a JavaScript expression in the browser page context. Returns the result.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'JavaScript expression to evaluate' },
        },
        required: ['expression'],
      },
    },
  ]

  async setup(context: ToolContext): Promise<void> {
    try {
      // Use require() — playwright is a CJS module; dynamic import() can return
      // undefined named exports when running inside Next.js compiled context.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pw = require('playwright') as { chromium: PwBrowser }
      const chromium = pw.chromium
      const browser = await chromium.launch({ headless: true })
      const ctx     = await browser.newContext({
        viewport:  { width: 1280, height: 720 },
        userAgent: 'AgentTask-Browser-Test/1.0',
      })
      const page = await ctx.newPage()
      browsers.set(context.taskId, browser)
      pages.set(context.taskId, page)
      console.log(`[playwright] Browser opened for task ${context.taskId}`)
    } catch (err) {
      throw new Error(
        `PlaywrightProvider setup failed: ${String(err)}\n` +
        `Install with: npm install playwright && npx playwright install chromium`
      )
    }
  }

  async teardown(context: ToolContext): Promise<void> {
    const page    = pages.get(context.taskId)
    const browser = browsers.get(context.taskId)
    if (page)    await page.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    pages.delete(context.taskId)
    browsers.delete(context.taskId)
    console.log(`[playwright] Browser closed for task ${context.taskId}`)
  }

  async execute(toolName: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const page = pages.get(context.taskId)
    if (!page) {
      return { success: false, output: null, error: 'Browser not initialized. Playwright setup() was not called.' }
    }
    const a = args as Record<string, unknown>

    try {
      switch (toolName) {
        case 'playwright_navigate': {
          const resp = await page.goto(a.url as string, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          return { success: true, output: { url: page.url(), status: resp?.status() } }
        }
        case 'playwright_click': {
          await page.click(a.selector as string, { timeout: (a.timeoutMs as number) ?? 10_000 })
          return { success: true, output: { clicked: a.selector, url: page.url() } }
        }
        case 'playwright_fill': {
          await page.fill(a.selector as string, a.value as string)
          return { success: true, output: { filled: a.selector } }
        }
        case 'playwright_screenshot': {
          const buf = await page.screenshot({ type: 'png', fullPage: false })
          return { success: true, output: { base64: buf.toString('base64'), mimeType: 'image/png', url: page.url() } }
        }
        case 'playwright_get_text': {
          const text = await page.textContent(a.selector as string, { timeout: (a.timeoutMs as number) ?? 10_000 })
          return { success: true, output: { text } }
        }
        case 'playwright_wait_for': {
          await page.waitForSelector(a.selector as string, { timeout: (a.timeoutMs as number) ?? 15_000 })
          return { success: true, output: { found: a.selector } }
        }
        case 'playwright_get_url': {
          return { success: true, output: { url: page.url() } }
        }
        case 'playwright_evaluate': {
          const result = await page.evaluate(a.expression as string)
          return { success: true, output: { result } }
        }
        default:
          return { success: false, output: null, error: `PlaywrightProvider does not handle: ${toolName}` }
      }
    } catch (err) {
      return { success: false, output: null, error: String(err) }
    }
  }
}
