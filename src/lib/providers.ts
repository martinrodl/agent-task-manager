/** Provider metadata — safe to import in both client and server code. */
export const PROVIDERS = [
  { value: 'anthropic',   label: 'Anthropic',              urlPlaceholder: 'https://api.anthropic.com',           needsKey: true  },
  { value: 'openai',      label: 'OpenAI',                 urlPlaceholder: 'https://api.openai.com',              needsKey: true  },
  { value: 'azure',       label: 'Azure AI Foundry',       urlPlaceholder: 'https://<resource>.openai.azure.com', needsKey: true  },
  { value: 'openrouter',  label: 'OpenRouter',              urlPlaceholder: 'https://openrouter.ai',               needsKey: true  },
  { value: 'ollama',      label: 'Ollama (local)',          urlPlaceholder: 'http://localhost:11434',              needsKey: false },
  { value: 'lmstudio',   label: 'LM Studio (local)',       urlPlaceholder: 'http://localhost:1234',               needsKey: false },
  { value: 'webui',       label: 'Open WebUI',              urlPlaceholder: 'http://localhost:3000',               needsKey: false },
  { value: 'claude-code', label: 'Claude Code (local CLI)', urlPlaceholder: '/usr/local/bin/claude',              needsKey: false },
  { value: 'custom',      label: 'Custom (OpenAI-compat)',  urlPlaceholder: 'http://localhost:8080',               needsKey: false },
] as const
