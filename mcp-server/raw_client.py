import subprocess
import json
import os

env = os.environ.copy()

cmd = [
    "docker", "run", "--rm", "-i",
    "-e", "AGENTTASK_URL=https://agenttaskmanager.martinrodl.me",
    "-e", "AGENTTASK_API_KEY=orchestrator-key-change-me",
    "-e", "AGENTTASK_AGENT_ID=claude-code",
    "-v", "/home/rodl/programy/agent-task-manager/mcp-server:/app",
    "-w", "/app",
    "node:20-alpine",
    "node", "--import", "tsx/esm", "index.ts"
]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def send(msg):
    raw = json.dumps(msg) + "\n"
    proc.stdin.write(raw)
    proc.stdin.flush()

def read():
    return json.loads(proc.stdout.readline().strip())

# 1. Initialize
send({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "raw", "version": "1.0"}
    }
})
init_resp = read()
print("Init:", init_resp)

send({
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
})

# 2. Create Project
send({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "create_project",
        "arguments": {
            "name": "Stock-screener",
            "slug": "stock-screener",
            "description": "Stock screener project created via MCP",
            "color": "#10B981"
        }
    }
})
create_resp = read()
print("Create Project:", create_resp)

