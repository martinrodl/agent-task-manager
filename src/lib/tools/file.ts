import fs from 'fs/promises'
import path from 'path'
import type { ToolProvider, ToolDefinition, ToolContext, ToolResult } from './types'

export class FileProvider implements ToolProvider {
  readonly name = 'file'

  readonly tools: ToolDefinition[] = [
    {
      name:        'file_read',
      description: 'Read the content of a file relative to the workspace path.',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string', description: 'Relative path within workspace' } },
        required: ['filePath'],
      },
    },
    {
      name:        'file_write',
      description: 'Write content to a file relative to the workspace path (creates intermediate dirs).',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path within workspace' },
          content:  { type: 'string', description: 'File content to write' },
        },
        required: ['filePath', 'content'],
      },
    },
    {
      name:        'file_list',
      description: 'List files and directories at a path relative to the workspace.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: 'Relative directory path (default: ".")' },
        },
      },
    },
    {
      name:        'file_delete',
      description: 'Delete a file relative to the workspace path.',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string', description: 'Relative path within workspace' } },
        required: ['filePath'],
      },
    },
  ]

  private resolveSafe(workspacePath: string, relPath: string): string {
    const abs = path.resolve(workspacePath, relPath)
    if (!abs.startsWith(path.resolve(workspacePath))) {
      throw new Error(`Path traversal detected: ${relPath}`)
    }
    return abs
  }

  async execute(toolName: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    if (!context.workspacePath) {
      return { success: false, output: null, error: 'workspacePath not set — FileProvider requires a workspace' }
    }
    const a = args as Record<string, string>

    try {
      switch (toolName) {
        case 'file_read': {
          const abs = this.resolveSafe(context.workspacePath, a.filePath)
          const content = await fs.readFile(abs, 'utf-8')
          return { success: true, output: { content } }
        }
        case 'file_write': {
          const abs = this.resolveSafe(context.workspacePath, a.filePath)
          await fs.mkdir(path.dirname(abs), { recursive: true })
          await fs.writeFile(abs, a.content, 'utf-8')
          return { success: true, output: { written: a.filePath } }
        }
        case 'file_list': {
          const abs = this.resolveSafe(context.workspacePath, a.dirPath ?? '.')
          const entries = await fs.readdir(abs, { withFileTypes: true })
          return {
            success: true,
            output:  {
              entries: entries.map(e => ({
                name: e.name,
                type: e.isDirectory() ? 'dir' : 'file',
              })),
            },
          }
        }
        case 'file_delete': {
          const abs = this.resolveSafe(context.workspacePath, a.filePath)
          await fs.unlink(abs)
          return { success: true, output: { deleted: a.filePath } }
        }
        default:
          return { success: false, output: null, error: `FileProvider does not handle: ${toolName}` }
      }
    } catch (err) {
      return { success: false, output: null, error: String(err) }
    }
  }
}
