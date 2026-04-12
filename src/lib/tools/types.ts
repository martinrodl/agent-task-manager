// Core Tool Provider types — shared across all providers and the agentic loop

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
  default?: unknown
  properties?: Record<string, ToolParameter>
  additionalProperties?: ToolParameter | boolean
  required?: string[]
  items?: ToolParameter
}

export interface ToolDefinition {
  name:        string
  description: string
  parameters: {
    type:        'object'
    properties?: Record<string, ToolParameter>
    required?:   string[]
  }
}

export interface ToolContext {
  taskId:           string
  workspacePath:    string | null   // workflow-level shared path (e.g. /srv/projects/myapp)
  taskWorkspaceDir: string | null   // per-task isolated scratch dir (auto-created)
  envVars:          Record<string, string>
  sandboxMode:      string | null   // null/"none" | "docker"
  dockerImage:      string | null   // docker image for sandbox mode
  dockerContainerId?: string        // set after container is started (stateful mode)
}

export interface ToolResult {
  success: boolean
  output:  unknown     // stdout, response body, base64 image, file content, etc.
  error?:  string
}

export interface ToolProvider {
  readonly name:  string            // "bash" | "playwright" | "http" | "file"
  readonly tools: ToolDefinition[]
  execute(toolName: string, args: unknown, context: ToolContext): Promise<ToolResult>
  setup?(context: ToolContext): Promise<void>
  teardown?(context: ToolContext): Promise<void>
}
