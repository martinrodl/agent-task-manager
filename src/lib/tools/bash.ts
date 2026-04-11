import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

const execAsync = promisify(exec)

export class BashProvider implements ToolProvider {
  readonly name = 'bash'

  readonly tools: ToolDefinition[] = [
    {
      name:        'bash_run',
      description: 'Execute a bash command in the workspace directory. Returns stdout, stderr and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command:   { type: 'string', description: 'The bash command to run' },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        },
        required: ['command'],
      },
    },
  ]

  async execute(_toolName: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const { command, timeoutMs = 30_000 } = args as { command: string; timeoutMs?: number }

    const cwd = context.workspacePath
      ? path.resolve(context.workspacePath)
      : process.cwd()

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout:   timeoutMs,
        env:       { ...process.env, ...context.envVars },
        maxBuffer: 1024 * 1024,
      })
      return {
        success: true,
        output:  { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 },
      }
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
      return {
        success: false,
        output:  {
          stdout:   e.stdout?.trim() ?? '',
          stderr:   e.stderr?.trim() ?? '',
          exitCode: e.code ?? 1,
        },
        error: e.message,
      }
    }
  }
}
