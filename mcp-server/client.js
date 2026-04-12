import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx/esm', 'index.ts'],
    env: {
      ...process.env,
      AGENTTASK_URL: 'https://agenttaskmanager.martinrodl.me',
      AGENTTASK_API_KEY: 'agent-key-change-me',
      AGENTTASK_AGENT_ID: 'antigravity-bot'
    }
  });

  const client = new Client(
    { name: 'mcp-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to MCP server.");

  const workflowsRes = await client.request(
    { method: 'tools/call', params: { name: 'list_workflows', arguments: {} } },
    (z) => z
  );
  
  const workflowsText = workflowsRes.content[0].text;
  const workflows = JSON.parse(workflowsText);
  console.log(`Found ${workflows.length} workflows.`);
  
  if (workflows.length === 0) {
    console.error("No workflows found!");
    process.exit(1);
  }

  const workflowId = workflows[0].id;
  console.log(`Using workflow ID: ${workflowId}`);

  const createRes = await client.request(
    {
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: {
          workflowId: workflowId,
          title: 'stock-screener',
          description: 'A stock screening project.',
          priority: 2
        }
      }
    },
    (z) => z
  );

  console.log("Create task response:", JSON.stringify(createRes, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
