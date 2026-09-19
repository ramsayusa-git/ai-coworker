# Connecting Claude to FreshRice

FreshRice ships an MCP server (`apps/mcp`) with 42 tools: daily brief, orders, customers, stock & lots, traceability, live riders, working hours, issues desk, sales CRM, reports, invoices (resend / reissue), coupons, message log.

It authenticates to the FreshRice API with a **service API key** (`frk_…`) created at **Admin → API keys**. The key is linked to a staff account; that account's role and the key's scope (read / read+write) decide what Claude may do. Every write is audited under that account.

Two transports are running on aiserver:

| Transport | Where | Use for |
|---|---|---|
| Streamable HTTP | `http://aiserver:4300/mcp` (pm2 `freshrice-mcp`) | Cowork / claude.ai connectors, Claude Code `--transport http` |
| stdio | `node apps/mcp/dist/index.js` | Claude Desktop on the same machine |

The HTTP transport is gated by a bearer token (`keys/mcp-bearer.txt`). Both the API key and the bearer are in `keys/` (gitignored).

## Claude Desktop (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "freshrice": {
      "command": "node",
      "args": ["/home/krishna/ai-work-space/ai-coworker/Fresh-Rice/app/apps/mcp/dist/index.js"],
      "env": { "FRESHRICE_API_URL": "http://localhost:4100", "FRESHRICE_API_KEY": "<paste key from keys/mcp-api-key.txt>" }
    }
  }
}
```

## Claude Code

```bash
claude mcp add --transport http freshrice http://aiserver:4300/mcp --header "Authorization: Bearer <keys/mcp-bearer.txt>"
```

## Cowork / claude.ai custom connector
Add a remote MCP server with URL `http://aiserver:4300/mcp` (expose via your tunnel/domain for off-LAN use) and header `Authorization: Bearer <keys/mcp-bearer.txt>`. The existing `energymonitor` connector in Cowork is the same pattern.

## Skills
`claude/skills/*/SKILL.md` — copy each folder into `~/.claude/skills/` (Claude Code) or add via Cowork's skills settings:

- **freshrice-daily-brief** — morning numbers + three things to fix
- **freshrice-issue-triage** — work the ticket queue, drafts replies in our voice (asks before sending)
- **freshrice-dispatch-check** — evening readiness check for tomorrow's routes
- **freshrice-gst-pack** — month-end GST / payables / stock pack for the CA
- **freshrice-lead-followups** — due/overdue leads with WhatsApp drafts, logs activity

## Rotating keys
Revoke at Admin → API keys (or `DELETE /v1/admin/api-keys/:id`), create a new one, update `FRESHRICE_API_KEY` in `ecosystem.config.cjs`, `pm2 restart freshrice-mcp`.
