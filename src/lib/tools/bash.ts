import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

const execAsync = promisify(exec)

// ─── Docker container lifecycle ───────────────────────────────────────────────
// In docker sandbox mode we start one container per task (stateful) so the
// agent's shell state (cwd, installed packages, env) persists across tool calls.

async function startContainer(context: ToolContext): Promise<string> {
  const image    = context.dockerImage ?? 'node:20-slim'
  const taskDir  = context.taskWorkspaceDir ?? '/tmp'
  const sharedDir = context.workspacePath

  const mounts = [
    `-v "${taskDir}:/workspace"`,
    sharedDir ? `-v "${sharedDir}:${sharedDir}:ro"` : '',   // project dir read-only
  ].filter(Boolean).join(' ')

  // network=host so container can reach localhost services (e.g. the web app under test)
  const cmd = `docker run -d --rm --network=host ${mounts} -w /workspace ${image} tail -f /dev/null`
  const { stdout } = await execAsync(cmd, { timeout: 30_000 })
  return stdout.trim()  // container ID
}

async function stopContainer(containerId: string): Promise<void> {
  await execAsync(`docker stop ${containerId}`).catch(() => {})
}

async function execInContainer(containerId: string, command: string, envVars: Record<string, string>, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const envFlags = Object.entries(envVars)
    .map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`)
    .join(' ')
  const wrapped = `docker exec ${envFlags} ${containerId} bash -c ${JSON.stringify(command)}`
  return execAsync(wrapped, { timeout: timeoutMs, maxBuffer: 1024 * 1024 })
}

// ─── BashProvider ─────────────────────────────────────────────────────────────

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

  // Called once per task — start Docker container if sandbox mode is docker
  async setup(context: ToolContext): Promise<void> {
    if (context.sandboxMode !== 'docker') return

    // Check docker is available
    await execAsync('docker info', { timeout: 5_000 }).catch(() => {
      throw new Error('Docker sandbox mode requires Docker to be running. Run `docker info` to check.')
    })

    const containerId = await startContainer(context)
    context.dockerContainerId = containerId
    console.log(`[bash] Docker container started: ${containerId.slice(0, 12)} (image: ${context.dockerImage ?? 'node:20-slim'})`)
  }

  // Called once per task — stop container on completion
  async teardown(context: ToolContext): Promise<void> {
    if (context.sandboxMode !== 'docker' || !context.dockerContainerId) return
    await stopContainer(context.dockerContainerId)
    console.log(`[bash] Docker container stopped: ${context.dockerContainerId.slice(0, 12)}`)
    delete context.dockerContainerId
  }

  async execute(_toolName: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const { command, timeoutMs = 30_000 } = args as { command: string; timeoutMs?: number }

    try {
      if (context.sandboxMode === 'docker') {
        return await this.runInDocker(command, timeoutMs, context)
      }
      return await this.runLocal(command, timeoutMs, context)
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
      return {
        success: false,
        output:  { stdout: e.stdout?.trim() ?? '', stderr: e.stderr?.trim() ?? '', exitCode: e.code ?? 1 },
        error:   e.message,
      }
    }
  }

  private async runInDocker(command: string, timeoutMs: number, context: ToolContext): Promise<ToolResult> {
    if (!context.dockerContainerId) {
      // Container not started yet (e.g. setup wasn't called) — start ad-hoc
      const containerId = await startContainer(context)
      context.dockerContainerId = containerId
    }

    try {
      const { stdout, stderr } = await execInContainer(
        context.dockerContainerId,
        command,
        context.envVars,
        timeoutMs,
      )
      return { success: true, output: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 } }
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
      return {
        success: false,
        output:  { stdout: e.stdout?.trim() ?? '', stderr: e.stderr?.trim() ?? '', exitCode: e.code ?? 1 },
        error:   e.message,
      }
    }
  }

  private async runLocal(command: string, timeoutMs: number, context: ToolContext): Promise<ToolResult> {
    // Use taskWorkspaceDir if available, fall back to workspacePath, then cwd
    const cwd = context.taskWorkspaceDir
      ? path.resolve(context.taskWorkspaceDir)
      : context.workspacePath
        ? path.resolve(context.workspacePath)
        : process.cwd()

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout:   timeoutMs,
      env:       { ...process.env, ...context.envVars },
      maxBuffer: 1024 * 1024,
    })
    return { success: true, output: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 } }
  }
}
