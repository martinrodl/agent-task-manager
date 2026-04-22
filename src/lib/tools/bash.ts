import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import path from 'path'
import os from 'os'
import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const SENSITIVE_ENV_KEYS = new Set([
  'SECRET_KEY', 'ADMIN_PASSWORD', 'AGENT_API_KEY', 'ORCHESTRATOR_API_KEY',
  'DATABASE_URL', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_PUBLIC_KEY',
])

function safeProcessEnv(): Record<string, string | undefined> {
  const env = { ...process.env }
  for (const key of SENSITIVE_ENV_KEYS) delete env[key]
  return env
}

// ─── Docker container lifecycle ───────────────────────────────────────────────
// In docker sandbox mode we start one container per task (stateful) so the
// agent's shell state (cwd, installed packages, env) persists across tool calls.

async function startContainer(context: ToolContext): Promise<string> {
  const image    = context.dockerImage ?? 'node:20-slim'
  const taskDir  = context.taskWorkspaceDir ?? '/tmp'
  const sharedDir = context.workspacePath

  const args = ['run', '-d', '--rm', '--network=host']
  args.push('-v', `${taskDir}:/workspace`)
  if (sharedDir) args.push('-v', `${sharedDir}:${sharedDir}:ro`)
  args.push('-w', '/workspace', image, 'tail', '-f', '/dev/null')

  const { stdout } = await execFileAsync('docker', args, { timeout: 30_000 })
  return stdout.trim()
}

async function stopContainer(containerId: string): Promise<void> {
  await execFileAsync('docker', ['stop', containerId]).catch(() => {})
}

async function execInContainer(containerId: string, command: string, envVars: Record<string, string>, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const envFile = path.join(os.tmpdir(), `agenttask-env-${containerId.slice(0, 12)}-${Date.now()}`)
  try {
    const envContent = Object.entries(envVars)
      .map(([k, v]) => `${k}=${v.replace(/\n/g, '\\n')}`)
      .join('\n')
    await writeFile(envFile, envContent, { mode: 0o600 })
    const args = ['exec', '--env-file', envFile, containerId, 'bash', '-c', command]
    return await execFileAsync('docker', args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  } finally {
    await unlink(envFile).catch(() => {})
  }
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

  // Called once per task — runs setupScript on HOST then starts sandbox container
  async setup(context: ToolContext): Promise<void> {
    // 1. Run setupScript on HOST (starts service containers, sets up env, etc.)
    if (context.setupScript) {
      console.log(`[bash] Running setupScript for task ${context.taskId}`)
      try {
        const cwd = context.taskWorkspaceDir ?? context.workspacePath ?? process.cwd()
        const setupEnv: Record<string, string | undefined> = {
          ...safeProcessEnv(),
          ...context.envVars,
          TASK_ID:        context.taskId,
          WORKSPACE_PATH: context.workspacePath ?? '',
        }
        const { stdout, stderr } = await execAsync(context.setupScript, {
          cwd,
          timeout:   120_000,   // 2 min for service startup
          shell:     '/bin/bash',
          env:       setupEnv as NodeJS.ProcessEnv,
          maxBuffer: 2 * 1024 * 1024,
        })
        if (stdout.trim()) console.log(`[bash:setup] stdout:\n${stdout.trim()}`)
        if (stderr.trim()) console.log(`[bash:setup] stderr:\n${stderr.trim()}`)
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string }
        const detail = [e.stderr?.trim(), e.stdout?.trim()].filter(Boolean).join('\n')
        throw new Error(`setupScript failed: ${e.message ?? 'unknown error'}\n${detail}`)
      }
    }

    // 2. Start agent sandbox container if docker mode
    if (context.sandboxMode !== 'docker') return

    await execFileAsync('docker', ['info'], { timeout: 5_000 }).catch(() => {
      throw new Error('Docker sandbox mode requires Docker to be running. Run `docker info` to check.')
    })

    const containerId = await startContainer(context)
    context.dockerContainerId = containerId
    console.log(`[bash] Docker container started: ${containerId.slice(0, 12)} (image: ${context.dockerImage ?? 'node:20-slim'})`)
  }

  // Called once per task — stop sandbox container + cleanup service containers from setupScript
  async teardown(context: ToolContext): Promise<void> {
    // Stop the agent's own sandbox container
    if (context.sandboxMode === 'docker' && context.dockerContainerId) {
      await stopContainer(context.dockerContainerId)
      console.log(`[bash] Docker container stopped: ${context.dockerContainerId.slice(0, 12)}`)
      delete context.dockerContainerId
    }

    // Auto-cleanup service containers started by setupScript.
    // Convention: containers are named "${TASK_ID}-<service>" (e.g. "cmxyz-db", "cmxyz-be").
    if (context.setupScript) {
      try {
        const { stdout } = await execFileAsync(
          'docker', ['ps', '-aq', '--filter', `name=${context.taskId}-`],
          { timeout: 5_000 },
        ).catch(() => ({ stdout: '', stderr: '' }))
        const ids = stdout.trim().split('\n').filter(Boolean)
        if (ids.length > 0) {
          await execFileAsync('docker', ['stop', ...ids], { timeout: 30_000 }).catch(() => {})
          await execFileAsync('docker', ['rm', ...ids], { timeout: 10_000 }).catch(() => {})
          console.log(`[bash] Cleaned up ${ids.length} service container(s) for task ${context.taskId}`)
        }
      } catch {
        // non-critical — containers may already be stopped
      }
    }
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
      env:       { ...safeProcessEnv(), ...context.envVars } as unknown as NodeJS.ProcessEnv,
      maxBuffer: 1024 * 1024,
    })
    return { success: true, output: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 } }
  }
}
