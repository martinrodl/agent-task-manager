export interface SkillTemplate {
  id:          string
  category:    string
  name:        string
  icon:        string
  description: string
  content:     string
  envVarHints: { key: string; description: string }[]
  setupUrl?:   string
  free:        boolean
}

export const SKILL_TEMPLATES: SkillTemplate[] = [

  // ── Web Search ────────────────────────────────────────────────────────────────

  {
    id: 'tavily_search',
    category: 'Web Search',
    name: 'tavily_web_search',
    icon: '🔍',
    description: 'AI-native web search with synthesised answers (LangChain/CrewAI default)',
    free: true,
    setupUrl: 'https://tavily.com/',
    envVarHints: [{ key: 'TAVILY_API_KEY', description: 'Tavily API key — 1,000 calls/month free' }],
    content: `## Web Search — Tavily

Tavily is designed specifically for AI agents: it returns clean, extracted content and a synthesised answer alongside raw results.

### Request

\`\`\`
POST https://api.tavily.com/search
Authorization: Bearer {{TAVILY_API_KEY}}
Content-Type: application/json

{
  "query": "your search query",
  "search_depth": "basic",
  "include_answer": true,
  "max_results": 5
}
\`\`\`

Replace \`{{TAVILY_API_KEY}}\` with the TAVILY_API_KEY environment variable.

Use \`search_depth: "advanced"\` for deep research (costs 2 credits instead of 1).

### Response fields

- \`answer\` — AI-synthesised direct answer (use this first for factual queries)
- \`results[]\` — \`{ url, title, content, score }\` — ranked results with extracted text

### Guidelines

- Set \`include_answer: true\` for quick factual queries
- Always cite \`url\` sources in your response
- Use \`include_domains\` / \`exclude_domains\` to focus on specific sites`,
  },

  {
    id: 'brave_search',
    category: 'Web Search',
    name: 'brave_web_search',
    icon: '🦁',
    description: 'Independent web index, fastest response, best quality scores',
    free: true,
    setupUrl: 'https://api.search.brave.com/',
    envVarHints: [{ key: 'BRAVE_API_KEY', description: 'Brave Search API key — ~1,000 queries free credit on sign-up' }],
    content: `## Web Search — Brave

Brave Search uses a fully independent index (not Google/Bing), making it ideal when neutrality matters. Fastest response times (~669ms average).

### Request

\`\`\`
GET https://api.search.brave.com/res/v1/web/search?q={QUERY}&count=10
X-Subscription-Token: {{BRAVE_API_KEY}}
Accept: application/json
\`\`\`

Replace \`{QUERY}\` with URL-encoded search terms. Replace \`{{BRAVE_API_KEY}}\` with the BRAVE_API_KEY environment variable.

### Response fields

- \`web.results[]\` — \`{ url, title, description, age }\`

### Guidelines

- Purely keyword-based (no semantic mode)
- Use \`count\` (max 20) to control result count
- Cite \`url\` sources in your response
- Best for current events, news, and independent results`,
  },

  {
    id: 'serper_search',
    category: 'Web Search',
    name: 'google_web_search',
    icon: '🔍',
    description: 'Real Google Search results via Serper.dev — 2,500 req/month free',
    free: true,
    setupUrl: 'https://serper.dev/',
    envVarHints: [{ key: 'SERPER_API_KEY', description: 'Serper.dev API key — 2,500 requests/month free (most generous)' }],
    content: `## Web Search — Google via Serper

Access real Google Search results. Most generous free tier (2,500 req/month). Built into CrewAI as \`SerperDevTool\`.

### Request

\`\`\`
POST https://google.serper.dev/search
X-API-KEY: {{SERPER_API_KEY}}
Content-Type: application/json

{
  "q": "your search query",
  "num": 10
}
\`\`\`

Replace \`{{SERPER_API_KEY}}\` with the SERPER_API_KEY environment variable.

Other endpoints: \`/news\`, \`/images\`, \`/scholar\` for specialised searches.

### Response fields

- \`answerBox\` — direct answer box for factual queries (check this first)
- \`organic[]\` — \`{ title, link, snippet }\`
- \`knowledgeGraph\` — entity info for named entities
- \`relatedSearches[]\`

### Guidelines

- Check \`answerBox\` first for quick factual answers
- Use \`/news\` endpoint for current events
- Add \`"gl": "us"\` to target a specific country`,
  },

  {
    id: 'exa_search',
    category: 'Web Search',
    name: 'exa_semantic_search',
    icon: '🧠',
    description: 'Neural/semantic web search — finds conceptually related content, not just keyword matches',
    free: true,
    setupUrl: 'https://exa.ai/',
    envVarHints: [{ key: 'EXA_API_KEY', description: 'Exa API key — 1,000 requests/month free' }],
    content: `## Web Search — Exa (Semantic)

Exa uses neural search to find conceptually related content even when exact keywords are absent. Highest agent benchmark score (8.7/10). Powers Cursor's \`@web\` feature.

### Request

\`\`\`
POST https://api.exa.ai/search
x-api-key: {{EXA_API_KEY}}
Content-Type: application/json

{
  "query": "your search query",
  "type": "auto",
  "numResults": 5,
  "contents": { "text": true }
}
\`\`\`

Replace \`{{EXA_API_KEY}}\` with the EXA_API_KEY environment variable.

Set \`type\` to \`"neural"\` for semantic search, \`"keyword"\` for exact match, \`"auto"\` to let Exa decide.

### Response fields

- \`results[]\` — \`{ url, title, text, highlights, score, publishedDate }\`

### Guidelines

- Use \`contents.text: true\` to get full page content in one call (no separate scrape needed)
- Use \`startPublishedDate\` / \`endPublishedDate\` for date-filtered research
- Use \`includeDomains\` to restrict to trusted sources
- Best for research where keyword matching would miss conceptually related documents`,
  },

  // ── Web Scraping ──────────────────────────────────────────────────────────────

  {
    id: 'firecrawl',
    category: 'Web Scraping',
    name: 'firecrawl_scrape',
    icon: '🕷️',
    description: 'Turn any URL into clean Markdown — handles JS, SPAs, PDFs (CrewAI default)',
    free: true,
    setupUrl: 'https://firecrawl.dev/',
    envVarHints: [{ key: 'FIRECRAWL_API_KEY', description: 'Firecrawl API key — 500 free credits on sign-up' }],
    content: `## Web Scraping — Firecrawl

Firecrawl converts any URL into clean Markdown, handling JavaScript rendering, SPAs, PDFs, and ad stripping. Built into CrewAI as \`FirecrawlScrapeWebsiteTool\`.

### Scrape a single URL

\`\`\`
POST https://api.firecrawl.dev/v1/scrape
Authorization: Bearer {{FIRECRAWL_API_KEY}}
Content-Type: application/json

{
  "url": "https://example.com/page",
  "formats": ["markdown"],
  "onlyMainContent": true
}
\`\`\`

Replace \`{{FIRECRAWL_API_KEY}}\` with the FIRECRAWL_API_KEY environment variable.

### Response

- \`data.markdown\` — clean Markdown content of the page
- \`data.metadata\` — title, description, ogImage

### Other endpoints

- \`POST /v1/crawl\` — crawl an entire site (returns job ID, poll for completion)
- \`POST /v1/map\` — discover all URLs on a site

### Guidelines

- Set \`onlyMainContent: true\` to remove nav, footer, ads
- Add \`waitFor: 2000\` (ms) for pages that load content dynamically
- For PDFs: works natively, no extra config needed`,
  },

  {
    id: 'jina_reader',
    category: 'Web Scraping',
    name: 'jina_reader',
    icon: '📖',
    description: 'Zero-config URL-to-Markdown — no account needed for basic use',
    free: true,
    setupUrl: 'https://jina.ai/reader/',
    envVarHints: [{ key: 'JINA_API_KEY', description: 'Jina API key — optional, but gives 1M free tokens (no key = 200 RPM)' }],
    content: `## Web Scraping — Jina Reader

The simplest URL-to-Markdown tool: just prepend \`https://r.jina.ai/\` to any URL. No account needed for basic use.

### Scrape a URL

\`\`\`
GET https://r.jina.ai/https://example.com/page
Authorization: Bearer {{JINA_API_KEY}}
Accept: text/plain
\`\`\`

\`{{JINA_API_KEY}}\` is optional — omit the header if you don't have a key (limited to 200 req/min).

### Search + retrieve content in one call

\`\`\`
GET https://s.jina.ai/?q=your+search+query
Authorization: Bearer {{JINA_API_KEY}}
\`\`\`

Returns top 5 results with full page content extracted — no separate scrape step needed.

### Guidelines

- Fastest way to get page content with zero setup
- Less reliable for heavy JavaScript SPAs than Firecrawl
- Self-hostable (Apache 2.0 open source)
- Use \`s.jina.ai\` to combine search + scrape in a single request`,
  },

  // ── Code Execution ────────────────────────────────────────────────────────────

  {
    id: 'e2b_sandbox',
    category: 'Code Execution',
    name: 'e2b_code_interpreter',
    icon: '⚡',
    description: 'Secure sandboxed code execution — Python, JS, and more (sub-200ms startup)',
    free: true,
    setupUrl: 'https://e2b.dev/',
    envVarHints: [{ key: 'E2B_API_KEY', description: 'E2B API key — $100 free credit, no card needed (~$0.05/hr per 1 vCPU)' }],
    content: `## Code Execution — E2B Sandbox

E2B provides Firecracker-isolated sandboxes for safe code execution with sub-200ms startup. Use for data analysis, math, code generation + execution, file manipulation.

### Run code via REST

\`\`\`
POST https://api.e2b.dev/sandboxes
X-API-Key: {{E2B_API_KEY}}
Content-Type: application/json

{ "templateID": "base" }
\`\`\`

Then execute code in the sandbox via the returned sandbox ID. Preferred: use the \`e2b-code-interpreter\` SDK.

### Via SDK (recommended)

\`\`\`python
from e2b_code_interpreter import Sandbox
sbx = Sandbox(api_key="{{E2B_API_KEY}}")
result = sbx.run_code("print(2 + 2)")
# result.text, result.results, result.error
sbx.kill()
\`\`\`

Replace \`{{E2B_API_KEY}}\` with the E2B_API_KEY environment variable.

### Guidelines

- Sessions last 1 hour on free tier (24h on Pro)
- Billed per second of runtime
- Supports: Python, JavaScript, R, Java, Bash, and more
- Sandboxes have internet access by default
- Use for: calculations, data analysis, running generated code safely`,
  },

  // ── Communication ─────────────────────────────────────────────────────────────

  {
    id: 'slack_bot',
    category: 'Notifications',
    name: 'slack_notify',
    icon: '💬',
    description: 'Send rich messages to a Slack channel via bot or webhook',
    free: true,
    setupUrl: 'https://api.slack.com/messaging/webhooks',
    envVarHints: [
      { key: 'SLACK_BOT_TOKEN', description: 'Slack Bot OAuth token (xoxb-...)' },
      { key: 'SLACK_CHANNEL_ID', description: 'Target channel ID (not name)' },
    ],
    content: `## Slack Notifications

Send messages to a Slack channel to report results, status updates, or errors.

### Send a message

\`\`\`
POST https://slack.com/api/chat.postMessage
Authorization: Bearer {{SLACK_BOT_TOKEN}}
Content-Type: application/json

{
  "channel": "{{SLACK_CHANNEL_ID}}",
  "text": "Task completed: your message here"
}
\`\`\`

Replace \`{{SLACK_BOT_TOKEN}}\` and \`{{SLACK_CHANNEL_ID}}\` with the environment variable values.

### Rich Block Kit message

\`\`\`json
{
  "channel": "{{SLACK_CHANNEL_ID}}",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "*Task completed* ✅" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Status:* Done" },
      { "type": "mrkdwn", "text": "*Duration:* 3 min" }
    ]}
  ]
}
\`\`\`

### Webhook (simpler, send-only)

\`\`\`
POST {{SLACK_WEBHOOK_URL}}
Content-Type: application/json

{ "text": "Your message" }
\`\`\`

### Guidelines

- Keep messages concise — avoid walls of text
- Always notify on task completion and on errors (include task ID)
- Required OAuth scopes: \`chat:write\`, \`channels:read\``,
  },

  {
    id: 'discord_webhook',
    category: 'Notifications',
    name: 'discord_notify',
    icon: '🎮',
    description: 'Send messages to a Discord channel via webhook — fully free',
    free: true,
    setupUrl: 'https://discord.com/developers/docs/resources/webhook',
    envVarHints: [{ key: 'DISCORD_WEBHOOK_URL', description: 'Discord Incoming Webhook URL (from channel settings)' }],
    content: `## Discord Notifications

Send messages to a Discord channel via webhook. Fully free, no bot required.

### Send a message

\`\`\`
POST {{DISCORD_WEBHOOK_URL}}
Content-Type: application/json

{
  "content": "Task completed: your message here",
  "username": "AgentTask"
}
\`\`\`

Replace \`{{DISCORD_WEBHOOK_URL}}\` with the DISCORD_WEBHOOK_URL environment variable.

### Rich embed

\`\`\`json
{
  "embeds": [{
    "title": "Task Completed",
    "description": "Details here...",
    "color": 3066993,
    "fields": [
      { "name": "Status", "value": "✅ Done", "inline": true },
      { "name": "Duration", "value": "3 min", "inline": true }
    ]
  }]
}
\`\`\`

Color is a decimal integer (3066993 = green, 15158332 = red, 3447003 = blue).

### Guidelines

- Add \`?wait=true\` to the URL to get the message ID (needed if you want to edit it later)
- Rate limit: 5 requests per 5 seconds per webhook
- Webhooks are outbound-only — use Discord Bot API if you need to read messages`,
  },

  {
    id: 'telegram_bot',
    category: 'Notifications',
    name: 'telegram_notify',
    icon: '✈️',
    description: 'Send messages via Telegram bot — fully free, unlimited',
    free: true,
    setupUrl: 'https://t.me/BotFather',
    envVarHints: [
      { key: 'TELEGRAM_BOT_TOKEN', description: 'Bot token from @BotFather' },
      { key: 'TELEGRAM_CHAT_ID', description: 'Target chat/user ID (get from /getUpdates after first message)' },
    ],
    content: `## Telegram Notifications

Send messages via a Telegram bot. Fully free, unlimited messages, no rate limits for normal use.

### Send a message

\`\`\`
POST https://api.telegram.org/bot{{TELEGRAM_BOT_TOKEN}}/sendMessage
Content-Type: application/json

{
  "chat_id": "{{TELEGRAM_CHAT_ID}}",
  "text": "Task completed ✅\\n\\nDetails here...",
  "parse_mode": "HTML"
}
\`\`\`

Replace \`{{TELEGRAM_BOT_TOKEN}}\` and \`{{TELEGRAM_CHAT_ID}}\` with the environment variable values.

### HTML formatting

Use HTML tags in \`text\` when \`parse_mode: "HTML"\`:
- \`<b>bold</b>\`, \`<i>italic</i>\`, \`<code>inline code</code>\`
- \`<pre>code block</pre>\`
- \`<a href="url">link text</a>\`

### Setup

1. Message \`@BotFather\` on Telegram → \`/newbot\` → get token
2. Send a message to the bot, then call \`/getUpdates\` to find your \`chat_id\`

### Guidelines

- Prefer \`parse_mode: "HTML"\` over MarkdownV2 (fewer escaping issues)
- Rate limit: 30 msg/sec global, 1 msg/sec per chat
- On 429 error: retry after \`retry_after\` seconds from the response`,
  },

  {
    id: 'email_resend',
    category: 'Notifications',
    name: 'send_email',
    icon: '📧',
    description: 'Send emails via Resend — 3,000 emails/month free',
    free: true,
    setupUrl: 'https://resend.com/',
    envVarHints: [{ key: 'RESEND_API_KEY', description: 'Resend API key — 3,000 emails/month free' }],
    content: `## Send Email — Resend

Send transactional emails. 3,000 emails/month free. Cleaner API than Mailgun/SendGrid.

### Send an email

\`\`\`
POST https://api.resend.com/emails
Authorization: Bearer {{RESEND_API_KEY}}
Content-Type: application/json

{
  "from": "Agent <agent@yourdomain.com>",
  "to": ["recipient@example.com"],
  "subject": "Task completed: your subject",
  "html": "<p>Task <strong>completed</strong>.</p>",
  "text": "Task completed."
}
\`\`\`

Replace \`{{RESEND_API_KEY}}\` with the RESEND_API_KEY environment variable.

### Guidelines

- \`from\` domain must be verified in Resend dashboard (add DNS records: SPF, DKIM)
- Always include both \`html\` and \`text\` versions
- Rate limit: 5 requests/second
- \`to\` is an array — you can send to multiple recipients at once
- Note: SendGrid free tier ended May 2025 — do not use for new projects`,
  },

  // ── Project Management ────────────────────────────────────────────────────────

  {
    id: 'github_api',
    category: 'Code & Git',
    name: 'github_api',
    icon: '🐙',
    description: 'Read/write GitHub issues, PRs, and files — 5,000 req/hour free',
    free: true,
    setupUrl: 'https://github.com/settings/tokens',
    envVarHints: [
      { key: 'GITHUB_TOKEN', description: 'GitHub fine-grained PAT (issues:write, contents:read)' },
      { key: 'GITHUB_OWNER', description: 'Repository owner (username or org)' },
      { key: 'GITHUB_REPO', description: 'Repository name' },
    ],
    content: `## GitHub API

Read and write GitHub issues, pull requests, comments, and file contents.

### Common requests

All requests use:
\`\`\`
Authorization: Bearer {{GITHUB_TOKEN}}
Accept: application/vnd.github+json
\`\`\`

**List open issues:**
\`GET https://api.github.com/repos/{{GITHUB_OWNER}}/{{GITHUB_REPO}}/issues?state=open&per_page=20\`

**Create an issue:**
\`\`\`
POST https://api.github.com/repos/{{GITHUB_OWNER}}/{{GITHUB_REPO}}/issues
{ "title": "Bug: ...", "body": "Markdown description", "labels": ["bug"] }
\`\`\`

**Add a comment:**
\`POST .../issues/{number}/comments\` with \`{ "body": "Comment text" }\`

**Read a file:**
\`GET .../contents/{path}\` → decode \`content\` field from base64

**List open PRs:**
\`GET .../pulls?state=open\`

**Get PR diff (changed files):**
\`GET .../pulls/{number}/files\`

### Guidelines

- Use fine-grained PAT scoped to specific repos
- Rate limit: 5,000 requests/hour per token
- Body fields support GitHub Flavored Markdown
- Replace \`{{GITHUB_TOKEN}}\`, \`{{GITHUB_OWNER}}\`, \`{{GITHUB_REPO}}\` with env var values`,
  },

  {
    id: 'linear_api',
    category: 'Project Management',
    name: 'linear_issues',
    icon: '📐',
    description: 'Create and update Linear issues via GraphQL API — free tier 250 issues',
    free: true,
    setupUrl: 'https://linear.app/settings/api',
    envVarHints: [{ key: 'LINEAR_API_KEY', description: 'Linear personal API key — free for up to 250 active issues' }],
    content: `## Linear Issues

Create and update issues in Linear via GraphQL.

### Endpoint

\`\`\`
POST https://api.linear.app/graphql
Authorization: Bearer {{LINEAR_API_KEY}}
Content-Type: application/json
\`\`\`

Replace \`{{LINEAR_API_KEY}}\` with the LINEAR_API_KEY environment variable.

### Create an issue

\`\`\`json
{
  "query": "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
  "variables": {
    "input": {
      "title": "Issue title",
      "description": "Markdown description",
      "teamId": "TEAM_ID",
      "priority": 2
    }
  }
}
\`\`\`

Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low.

### Add a comment

\`\`\`json
{
  "query": "mutation { commentCreate(input: { issueId: \\"ISSUE_ID\\", body: \\"Comment text\\" }) { success } }"
}
\`\`\`

### Get team ID first

\`\`\`json
{ "query": "{ teams { nodes { id name } } }" }
\`\`\`

### Guidelines

- All operations use GraphQL — no REST endpoints
- Linear also has a hosted MCP server at \`https://mcp.linear.app/mcp\` (OAuth 2.1)`,
  },

  {
    id: 'jira_api',
    category: 'Project Management',
    name: 'jira_issues',
    icon: '🎯',
    description: 'Create and transition Jira issues — free for up to 10 users',
    free: true,
    setupUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    envVarHints: [
      { key: 'JIRA_URL', description: 'Your Jira cloud URL, e.g. https://yourcompany.atlassian.net' },
      { key: 'JIRA_EMAIL', description: 'Your Atlassian account email' },
      { key: 'JIRA_API_TOKEN', description: 'Jira API token (from Atlassian account settings)' },
    ],
    content: `## Jira Issues

Create and update Jira issues via the REST API.

### Authentication

All requests use HTTP Basic auth: base64(\`{{JIRA_EMAIL}}:{{JIRA_API_TOKEN}}\`)
\`\`\`
Authorization: Basic {base64(JIRA_EMAIL:JIRA_API_TOKEN)}
Content-Type: application/json
\`\`\`

### Create an issue

\`\`\`
POST {{JIRA_URL}}/rest/api/3/issue

{
  "fields": {
    "project": { "key": "PROJ" },
    "summary": "Issue title",
    "issuetype": { "name": "Task" },
    "description": {
      "type": "doc", "version": 1,
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Description here" }] }]
    }
  }
}
\`\`\`

Note: description uses Atlassian Document Format (ADF), not plain text.

### Get available transitions

\`GET {{JIRA_URL}}/rest/api/3/issue/{issueKey}/transitions\`

### Transition an issue

\`\`\`
POST {{JIRA_URL}}/rest/api/3/issue/{issueKey}/transitions
{ "transition": { "id": "TRANSITION_ID" } }
\`\`\`

### Guidelines

- Use API token, not your account password
- Replace \`{{JIRA_URL}}\`, \`{{JIRA_EMAIL}}\`, \`{{JIRA_API_TOKEN}}\` with env var values`,
  },

  // ── Storage ───────────────────────────────────────────────────────────────────

  {
    id: 'cloudflare_r2',
    category: 'Storage',
    name: 'cloudflare_r2_storage',
    icon: '☁️',
    description: 'S3-compatible object storage — 10GB free, zero egress fees',
    free: true,
    setupUrl: 'https://dash.cloudflare.com/',
    envVarHints: [
      { key: 'R2_ACCOUNT_ID', description: 'Cloudflare account ID' },
      { key: 'R2_ACCESS_KEY_ID', description: 'R2 API token access key ID' },
      { key: 'R2_SECRET_ACCESS_KEY', description: 'R2 API token secret access key' },
      { key: 'R2_BUCKET_NAME', description: 'R2 bucket name' },
    ],
    content: `## Cloudflare R2 — Object Storage

S3-compatible object storage. Best choice for AI agents: 10GB + 10M operations/month free, and zero egress fees (critical when agents frequently read stored files).

### S3-compatible endpoint

R2 is fully S3-compatible — use the AWS SDK v3 with a custom endpoint:

\`\`\`
endpoint: https://{{R2_ACCOUNT_ID}}.r2.cloudflarestorage.com
region: "auto"
credentials:
  accessKeyId: {{R2_ACCESS_KEY_ID}}
  secretAccessKey: {{R2_SECRET_ACCESS_KEY}}
\`\`\`

### Common operations via AWS SDK

**Upload a file:**
\`PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: "path/file.txt", Body: content })\`

**Download a file:**
\`GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: "path/file.txt" })\`

**Generate a time-limited public URL:**
\`getSignedUrl(client, new GetObjectCommand(...), { expiresIn: 3600 })\`

**List files:**
\`ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: "folder/" })\`

### Guidelines

- Replace all \`{{R2_*}}\` placeholders with the corresponding environment variable values
- Preferred over AWS S3 for agent use (no egress fees when reading outputs repeatedly)
- Use \`getSignedUrl\` to share file URLs in task results`,
  },

  // ── Calendar ──────────────────────────────────────────────────────────────────

  {
    id: 'google_calendar',
    category: 'Productivity',
    name: 'google_calendar',
    icon: '📅',
    description: 'Read and create Google Calendar events — free, 1M queries/day',
    free: true,
    setupUrl: 'https://console.cloud.google.com/',
    envVarHints: [
      { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth 2.0 client ID' },
      { key: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth 2.0 client secret' },
      { key: 'GOOGLE_REFRESH_TOKEN', description: 'OAuth refresh token (obtained via one-time auth flow)' },
    ],
    content: `## Google Calendar

Read and create Google Calendar events.

### Authentication

Exchange \`{{GOOGLE_REFRESH_TOKEN}}\` for an access token:
\`\`\`
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id={{GOOGLE_CLIENT_ID}}&client_secret={{GOOGLE_CLIENT_SECRET}}&refresh_token={{GOOGLE_REFRESH_TOKEN}}&grant_type=refresh_token
\`\`\`

Use the returned \`access_token\` in subsequent requests as \`Authorization: Bearer {access_token}\`.

Tokens expire in 1 hour — always refresh before each session.

### List upcoming events

\`\`\`
GET https://www.googleapis.com/calendar/v3/calendars/primary/events
  ?timeMin={ISO8601_now}&maxResults=10&orderBy=startTime&singleEvents=true
Authorization: Bearer {access_token}
\`\`\`

### Create an event

\`\`\`
POST https://www.googleapis.com/calendar/v3/calendars/primary/events

{
  "summary": "Meeting title",
  "start": { "dateTime": "2025-05-01T10:00:00", "timeZone": "Europe/Prague" },
  "end":   { "dateTime": "2025-05-01T11:00:00", "timeZone": "Europe/Prague" }
}
\`\`\`

### Check availability (free/busy)

\`\`\`
POST https://www.googleapis.com/calendar/v3/freeBusy
{ "timeMin": "...", "timeMax": "...", "items": [{ "id": "primary" }] }
\`\`\`

### Guidelines

- Required OAuth scope: \`https://www.googleapis.com/auth/calendar\`
- Always check \`freeBusy\` before scheduling to avoid conflicts`,
  },

  // ── AI Sub-Calls ──────────────────────────────────────────────────────────────

  {
    id: 'dalle_image',
    category: 'AI Generation',
    name: 'generate_image',
    icon: '🎨',
    description: 'Generate images via OpenAI gpt-image-1 (DALL-E 3 successor)',
    free: false,
    setupUrl: 'https://platform.openai.com/api-keys',
    envVarHints: [{ key: 'OPENAI_API_KEY', description: 'OpenAI API key — billed per image (~$0.04-0.19 depending on quality/size)' }],
    content: `## Image Generation — OpenAI gpt-image-1

Generate images from text descriptions. DALL-E 2/3 deprecated — use \`gpt-image-1\`.

### Request

\`\`\`
POST https://api.openai.com/v1/images/generations
Authorization: Bearer {{OPENAI_API_KEY}}
Content-Type: application/json

{
  "model": "gpt-image-1",
  "prompt": "A detailed description of the image",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "output_format": "png"
}
\`\`\`

Replace \`{{OPENAI_API_KEY}}\` with the OPENAI_API_KEY environment variable.

Sizes: \`1024x1024\`, \`1536x1024\` (landscape), \`1024x1536\` (portrait).
Quality: \`low\`, \`medium\`, \`high\`.

### Response

Returns \`data[0].b64_json\` — base64-encoded PNG. Decode and save to disk or upload to storage.

### Guidelines

- Write detailed, specific prompts for best results
- Save generated images to R2/S3 and return the URL in task result
- For iterative image editing, use the Responses API tool instead of this endpoint`,
  },

  {
    id: 'stability_image',
    category: 'AI Generation',
    name: 'stability_generate_image',
    icon: '🖼️',
    description: 'Generate images via Stability AI — pay-per-credit, no subscription needed',
    free: false,
    setupUrl: 'https://platform.stability.ai/',
    envVarHints: [{ key: 'STABILITY_API_KEY', description: 'Stability AI API key — 25 free credits on sign-up, then pay-per-use ($0.01/credit)' }],
    content: `## Image Generation — Stability AI

Generate images via Stable Diffusion. Pay-per-credit, no monthly subscription.

### Request (Stable Image Core — fast/affordable)

\`\`\`
POST https://api.stability.ai/v2beta/stable-image/generate/core
Authorization: Bearer {{STABILITY_API_KEY}}
Accept: image/*
Content-Type: multipart/form-data

prompt: "A detailed description of the image"
output_format: png
aspect_ratio: 1:1
\`\`\`

Note: request is \`multipart/form-data\`, NOT JSON.

Replace \`{{STABILITY_API_KEY}}\` with the STABILITY_API_KEY environment variable.

### Aspect ratios

\`1:1\`, \`16:9\`, \`9:16\`, \`4:3\`, \`3:4\`, \`21:9\`

### Response

Binary image data — save directly to file or upload to storage.

### Models

- \`/stable-image/generate/core\` — ~$0.03/image, fast, good quality
- \`/stable-image/generate/ultra\` — ~$0.08/image, highest quality (SD3.5)

### Guidelines

- Save generated images to R2/S3 and include the URL in task result
- Add \`negative_prompt\` to exclude unwanted elements`,
  },

  {
    id: 'openai_tts',
    category: 'AI Generation',
    name: 'text_to_speech',
    icon: '🔊',
    description: 'Convert text to speech via OpenAI TTS — $0.015/1K chars',
    free: false,
    setupUrl: 'https://platform.openai.com/api-keys',
    envVarHints: [{ key: 'OPENAI_API_KEY', description: 'OpenAI API key — $0.015/1K chars (tts-1) or $0.030/1K chars (tts-1-hd)' }],
    content: `## Text-to-Speech — OpenAI TTS

Convert text to natural-sounding speech.

### Request

\`\`\`
POST https://api.openai.com/v1/audio/speech
Authorization: Bearer {{OPENAI_API_KEY}}
Content-Type: application/json

{
  "model": "tts-1",
  "input": "Text to convert to speech (max 4096 chars)",
  "voice": "nova",
  "response_format": "mp3",
  "speed": 1.0
}
\`\`\`

Replace \`{{OPENAI_API_KEY}}\` with the OPENAI_API_KEY environment variable.

### Models

- \`tts-1\` — $0.015/1K chars, optimised for speed
- \`tts-1-hd\` — $0.030/1K chars, higher quality

### Voices

\`alloy\`, \`ash\`, \`coral\`, \`echo\`, \`fable\`, \`nova\`, \`onyx\`, \`sage\`, \`shimmer\`

### Response

Binary audio data (MP3). Save to file or upload to storage.

### Guidelines

- Max 4,096 characters per request — split longer text into chunks
- Save audio to R2/S3 and return the URL in task result
- \`nova\` and \`shimmer\` are good defaults for natural-sounding output`,
  },

  // ── Finance ───────────────────────────────────────────────────────────────────

  {
    id: 'finnhub',
    category: 'Finance',
    name: 'finnhub_stock_data',
    icon: '📈',
    description: 'Real-time stock quotes, news, fundamentals — best free tier (60 req/min)',
    free: true,
    setupUrl: 'https://finnhub.io/register',
    envVarHints: [{ key: 'FINNHUB_API_KEY', description: 'Finnhub API key — free: 60 calls/min, no credit card' }],
    content: `## Stock Data — Finnhub

Real-time quotes, company news, fundamentals, earnings calendar. Best free tier: 60 calls/minute, no credit card.

### Base URL

\`https://finnhub.io/api/v1/{endpoint}?token={{FINNHUB_API_KEY}}\`

Replace \`{{FINNHUB_API_KEY}}\` with the FINNHUB_API_KEY environment variable.

### Key endpoints

**Real-time quote:**
\`GET /quote?symbol=AAPL\`
Returns: \`{ c: currentPrice, h: high, l: low, o: open, pc: previousClose, dp: changePercent }\`

**Company news (last 7 days):**
\`GET /company-news?symbol=AAPL&from=2025-01-01&to=2025-01-07\`

**Company profile:**
\`GET /stock/profile2?symbol=AAPL\`

**Earnings calendar:**
\`GET /calendar/earnings?from=2025-01-01&to=2025-01-31\`

**Candlestick data (OHLCV):**
\`GET /stock/candle?symbol=AAPL&resolution=D&from={unix_from}&to={unix_to}\`

### Guidelines

- Token is a query parameter, not a header
- \`resolution\`: \`1\`, \`5\`, \`15\`, \`30\`, \`60\` (minutes), \`D\`, \`W\`, \`M\`
- IEX Cloud shut down Aug 2024 — Finnhub is the recommended replacement
- Insider trading, congressional trading, social sentiment all available on free tier`,
  },

  {
    id: 'alpha_vantage',
    category: 'Finance',
    name: 'alpha_vantage_market_data',
    icon: '💹',
    description: 'Stocks, forex, crypto, technical indicators — 25 req/day free',
    free: true,
    setupUrl: 'https://www.alphavantage.co/support/#api-key',
    envVarHints: [{ key: 'ALPHA_VANTAGE_API_KEY', description: 'Alpha Vantage API key — free: 25 requests/day' }],
    content: `## Market Data — Alpha Vantage

Comprehensive financial data: stocks, forex, crypto, 50+ technical indicators, economic data.

### Base URL pattern

\`GET https://www.alphavantage.co/query?function={FUNCTION}&apikey={{ALPHA_VANTAGE_API_KEY}}&...\`

Replace \`{{ALPHA_VANTAGE_API_KEY}}\` with the ALPHA_VANTAGE_API_KEY environment variable.

### Key functions

**Real-time quote:**
\`?function=GLOBAL_QUOTE&symbol=AAPL\`

**Daily OHLCV:**
\`?function=TIME_SERIES_DAILY&symbol=AAPL&outputsize=compact\`
(\`compact\` = last 100 days; \`full\` = 20yr history, premium only)

**50-day SMA:**
\`?function=SMA&symbol=AAPL&interval=daily&time_period=50&series_type=close\`

**Forex:**
\`?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR\`

**Crypto:**
\`?function=DIGITAL_CURRENCY_DAILY&symbol=BTC&market=USD\`

### Guidelines

- Cache responses — hard limit: 25 requests/day on free tier
- Use \`outputsize=compact\` to stay within free limits
- Official MCP server available at \`mcp.alphavantage.co\`
- Good for prototyping; switch to Finnhub for higher call volume`,
  },

  // ── Maps ──────────────────────────────────────────────────────────────────────

  {
    id: 'nominatim',
    category: 'Maps & Geo',
    name: 'geocode_address',
    icon: '📍',
    description: 'Geocode addresses to coordinates via OpenStreetMap — completely free, no key',
    free: true,
    envVarHints: [],
    content: `## Geocoding — Nominatim (OpenStreetMap)

Convert addresses to coordinates (and reverse). Completely free, no API key required.

### Forward geocoding (address → lat/lng)

\`\`\`
GET https://nominatim.openstreetmap.org/search?q={ADDRESS}&format=json&limit=1
User-Agent: YourAppName/1.0 (contact@example.com)
\`\`\`

URL-encode the address. A descriptive User-Agent header is required by Nominatim policy.

### Reverse geocoding (lat/lng → address)

\`\`\`
GET https://nominatim.openstreetmap.org/reverse?lat={LAT}&lon={LON}&format=json
User-Agent: YourAppName/1.0 (contact@example.com)
\`\`\`

### Response fields

- \`lat\`, \`lon\` — coordinates (forward geocoding)
- \`display_name\` — full formatted address
- \`address\` — structured: \`{ road, city, country, postcode }\`

### Guidelines

- Hard limit: 1 request/second — do not exceed
- Not for bulk geocoding or commercial use
- Pair with Open-Meteo (pass \`lat\`/\`lon\` from geocoding result)
- For higher rate limits: use \`geocode.maps.co\` (Nominatim-based, needs free API key)`,
  },

  // ── Translation ───────────────────────────────────────────────────────────────

  {
    id: 'deepl',
    category: 'Translation',
    name: 'deepl_translate',
    icon: '🌍',
    description: 'High-quality translation via DeepL — 500,000 characters/month free',
    free: true,
    setupUrl: 'https://www.deepl.com/pro-api',
    envVarHints: [{ key: 'DEEPL_API_KEY', description: 'DeepL API key — 500,000 chars/month free tier' }],
    content: `## Translation — DeepL

High-quality machine translation. 500,000 characters/month free.

### Request

\`\`\`
POST https://api-free.deepl.com/v2/translate
Authorization: DeepL-Auth-Key {{DEEPL_API_KEY}}
Content-Type: application/json

{
  "text": ["Text to translate", "More text"],
  "target_lang": "DE"
}
\`\`\`

**Important:** Free tier uses \`api-free.deepl.com\`. Pro/paid uses \`api.deepl.com\`. Using the wrong host returns 403.

Replace \`{{DEEPL_API_KEY}}\` with the DEEPL_API_KEY environment variable.

### Language codes

\`EN-US\`, \`EN-GB\`, \`DE\`, \`FR\`, \`ES\`, \`PT-BR\`, \`PT-PT\`, \`IT\`, \`NL\`, \`PL\`, \`JA\`, \`ZH\`, \`RU\`, \`CS\`, \`SK\`

### Response

\`translations[]\` — each item has \`detected_source_language\` and \`text\`

### Guidelines

- \`text\` is an array — batch multiple strings in one API call
- \`source_lang\` is optional — DeepL auto-detects with high accuracy
- GET requests deprecated March 2025 — POST only
- Free tier text may be used for training; Pro deletes immediately`,
  },

  // ── Weather ───────────────────────────────────────────────────────────────────

  {
    id: 'open_meteo',
    category: 'Data',
    name: 'weather_forecast',
    icon: '🌤️',
    description: 'Weather forecasts and history — completely free, no API key needed',
    free: true,
    envVarHints: [],
    content: `## Weather — Open-Meteo

Free weather API. No API key or sign-up required for non-commercial use.

### Current weather + 7-day forecast

\`\`\`
GET https://api.open-meteo.com/v1/forecast
  ?latitude={LAT}
  &longitude={LON}
  &current=temperature_2m,wind_speed_10m,precipitation,weather_code,relative_humidity_2m
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max
  &timezone=auto
  &forecast_days=7
\`\`\`

\`latitude\` and \`longitude\` are required. Use the Nominatim geocoding skill to convert city names to coordinates.

### Weather code interpretation (WMO standard)

- 0: Clear sky, 1-3: Partly cloudy, 45-48: Fog, 51-67: Drizzle/Rain
- 71-77: Snow, 80-82: Rain showers, 95: Thunderstorm

### Historical data

\`\`\`
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude={LAT}&longitude={LON}
  &start_date=2024-01-01&end_date=2024-01-31
  &daily=temperature_2m_max,precipitation_sum
\`\`\`

### Guidelines

- Set \`timezone=auto\` for local time in the response
- Also available: Air Quality API, Marine Forecast API (all free, same base URL pattern)
- MCP server available — no key needed`,
  },

  // ── Knowledge ─────────────────────────────────────────────────────────────────

  {
    id: 'wikipedia',
    category: 'Knowledge',
    name: 'wikipedia_lookup',
    icon: '📚',
    description: 'Look up facts and summaries from Wikipedia — free, no key',
    free: true,
    envVarHints: [],
    content: `## Wikipedia Lookup

Query Wikipedia for factual summaries. No API key required.

### Get article summary

\`\`\`
GET https://en.wikipedia.org/api/rest_v1/page/summary/{TITLE}
Accept: application/json
\`\`\`

Replace spaces in title with underscores, e.g. \`Eiffel_Tower\`.

### Search for the right title first

\`\`\`
GET https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={QUERY}&format=json&srlimit=3
\`\`\`

Then use the first result's \`title\` in the summary endpoint above.

### Response fields (summary endpoint)

- \`extract\` — plain-text summary (first few paragraphs)
- \`title\` — canonical page title
- \`content_urls.desktop.page\` — URL to full article

### Guidelines

- Use for stable factual information: history, science, geography, people, concepts
- Do not use for current events — Wikipedia may lag behind news
- Always cite the article URL in your response
- For non-English content, replace \`en.wikipedia.org\` with \`de.\`, \`fr.\`, \`cs.\` etc.`,
  },

  // ── Vector DB / Memory ────────────────────────────────────────────────────────

  {
    id: 'pinecone',
    category: 'Memory & RAG',
    name: 'vector_memory_search',
    icon: '🧩',
    description: 'Store and search vector embeddings for RAG/semantic memory (Pinecone)',
    free: true,
    setupUrl: 'https://app.pinecone.io/',
    envVarHints: [
      { key: 'PINECONE_API_KEY', description: 'Pinecone API key — free Starter: 2GB storage' },
      { key: 'PINECONE_INDEX_HOST', description: 'Index host URL from Pinecone dashboard' },
    ],
    content: `## Vector Memory — Pinecone (RAG)

Store text as embeddings and retrieve semantically similar content. Essential for long-term memory and RAG pipelines.

### Embed text first (OpenAI)

\`\`\`
POST https://api.openai.com/v1/embeddings
Authorization: Bearer {{OPENAI_API_KEY}}
{ "input": "text to embed", "model": "text-embedding-3-small" }
\`\`\`

Returns \`data[0].embedding\` — a 1536-dimension float array.

### Upsert vectors

\`\`\`
POST {{PINECONE_INDEX_HOST}}/vectors/upsert
Api-Key: {{PINECONE_API_KEY}}
Content-Type: application/json

{
  "vectors": [{
    "id": "unique-id",
    "values": [0.1, 0.2, ...],
    "metadata": { "text": "original text", "source": "document.pdf" }
  }]
}
\`\`\`

### Query for similar vectors

\`\`\`
POST {{PINECONE_INDEX_HOST}}/query
Api-Key: {{PINECONE_API_KEY}}

{
  "vector": [0.1, 0.2, ...],
  "topK": 5,
  "includeMetadata": true
}
\`\`\`

Returns \`matches[]\` with \`score\` and \`metadata.text\`.

### Guidelines

- Replace \`{{PINECONE_API_KEY}}\` and \`{{PINECONE_INDEX_HOST}}\` with env var values
- Embed the user query the same way you embedded stored documents
- Use \`metadata.text\` from top matches as context in your next LLM call`,
  },

  // ── Browser Automation ────────────────────────────────────────────────────────

  {
    id: 'browserless',
    category: 'Browser Automation',
    name: 'browser_screenshot',
    icon: '🌐',
    description: 'Take screenshots and extract content from any URL via Browserless',
    free: true,
    setupUrl: 'https://www.browserless.io/',
    envVarHints: [{ key: 'BROWSERLESS_API_KEY', description: 'Browserless API key — free tier available' }],
    content: `## Browser Automation — Browserless

Run a real Chromium browser via REST API to take screenshots, extract content, or run custom code on any page.

### Take a screenshot

\`\`\`
POST https://chrome.browserless.io/screenshot?token={{BROWSERLESS_API_KEY}}
Content-Type: application/json

{
  "url": "https://example.com",
  "options": { "fullPage": true, "type": "png" }
}
\`\`\`

Replace \`{{BROWSERLESS_API_KEY}}\` with the BROWSERLESS_API_KEY environment variable.

### Get page content (rendered HTML → text)

\`\`\`
POST https://chrome.browserless.io/content?token={{BROWSERLESS_API_KEY}}
{ "url": "https://example.com" }
\`\`\`

### Scrape specific elements

\`\`\`
POST https://chrome.browserless.io/scrape?token={{BROWSERLESS_API_KEY}}
{
  "url": "https://example.com",
  "elements": [{ "selector": "h1" }, { "selector": ".price" }]
}
\`\`\`

### Run custom Puppeteer code

\`\`\`
POST https://chrome.browserless.io/function?token={{BROWSERLESS_API_KEY}}
{
  "code": "async({ page }) => { await page.goto('https://example.com'); return page.title(); }"
}
\`\`\`

### Guidelines

- Use for pages that require JavaScript rendering (SPAs, login-gated content)
- For simple scraping, prefer Firecrawl or Jina Reader (cheaper)
- Save screenshots to R2/S3 and return the URL in task result`,
  },

  // ── Utilities ─────────────────────────────────────────────────────────────────

  {
    id: 'pastebin',
    category: 'Utilities',
    name: 'pastebin_store_output',
    icon: '📋',
    description: 'Store long text outputs and return a shareable URL',
    free: true,
    setupUrl: 'https://pastebin.com/api',
    envVarHints: [{ key: 'PASTEBIN_API_KEY', description: 'Pastebin developer API key (free account)' }],
    content: `## Store Long Output — Pastebin

When you generate large text (logs, reports, generated code), upload to Pastebin and return the URL instead of including everything inline.

### Create a paste

\`\`\`
POST https://pastebin.com/api/api_post.php
Content-Type: application/x-www-form-urlencoded

api_dev_key={{PASTEBIN_API_KEY}}&api_option=paste&api_paste_code=CONTENT&api_paste_name=TITLE&api_paste_expire_date=1W&api_paste_format=text
\`\`\`

Replace \`{{PASTEBIN_API_KEY}}\` with the PASTEBIN_API_KEY environment variable.

Expiry options: \`10M\` (10 min), \`1H\`, \`1D\`, \`1W\`, \`1M\`, \`N\` (never).

### Response

Returns the paste URL as plain text: \`https://pastebin.com/AbCdEfGh\`

### When to use

- Generated code longer than ~100 lines
- Log files or command outputs
- Reports that would clutter the task result

Always include the URL in your \`result\` JSON so it appears in the task detail view.`,
  },

  {
    id: 'http_request',
    category: 'Utilities',
    name: 'http_request',
    icon: '🔌',
    description: 'Make arbitrary HTTP requests to any REST API',
    free: true,
    envVarHints: [],
    content: `## Generic HTTP Request

Use for any REST API not covered by a dedicated skill.

### Pattern

\`\`\`
fetch(url, {
  method: "POST",   // GET | POST | PUT | PATCH | DELETE
  headers: {
    "Authorization": "Bearer TOKEN_FROM_ENV",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ key: "value" })
})
\`\`\`

### Common auth patterns

- **Bearer token:** \`Authorization: Bearer {TOKEN}\`
- **API key header:** \`X-API-Key: {KEY}\` or \`X-API-TOKEN: {KEY}\`
- **Basic auth:** \`Authorization: Basic {base64(user:pass)}\`
- **Query param:** \`?api_key={KEY}\` or \`?token={KEY}\`

### Error handling

| Status | Action |
|--------|--------|
| 2xx | Success — parse response |
| 400 | Bad request — fix parameters, do not retry |
| 401/403 | Auth error — check token/key |
| 404 | Not found — check URL/ID |
| 429 | Rate limited — wait \`Retry-After\` seconds, then retry |
| 5xx | Server error — retry with exponential backoff (wait 1s, 2s, 4s) |

### Guidelines

- Always read the API documentation before constructing the request
- Log the URL and status code for debugging
- Never hardcode secrets — always read from environment variables`,
  },
]

export const TEMPLATE_CATEGORIES = [...new Set(SKILL_TEMPLATES.map(t => t.category))]
