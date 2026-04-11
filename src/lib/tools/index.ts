import { registerProvider } from './registry'
import { BashProvider }       from './bash'
import { HttpProvider }       from './http'
import { FileProvider }       from './file'
import { PlaywrightProvider } from './playwright'

let registered = false

export function ensureProvidersRegistered(): void {
  if (registered) return
  registered = true
  registerProvider(new BashProvider())
  registerProvider(new HttpProvider())
  registerProvider(new FileProvider())
  registerProvider(new PlaywrightProvider())
}

export const AVAILABLE_TOOLS = ['bash', 'http', 'file', 'playwright'] as const
export type ToolProviderName  = (typeof AVAILABLE_TOOLS)[number]
