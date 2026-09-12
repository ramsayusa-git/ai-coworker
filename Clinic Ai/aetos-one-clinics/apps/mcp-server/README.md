# @aetos/mcp-server

An MCP (Model Context Protocol) server that lets Claude Code, Claude Desktop,
Codex, or any other MCP client connect to and manage a running Aetos One
Clinics instance directly — enable/configure add-ons, look up patients and the
day's queue, manage users/roles, and update white-label branding — the same
way the `aetosonepro` connector manages a Home Assistant instance.

## Connect from Claude Code / Claude Desktop

Add to your MCP config (e.g. `claude_desktop_config.json` or a Claude Code
`.mcp.json`):

```json
{
  "mcpServers": {
    "aetos-one-clinics": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp-server/dist/index.js"],
      "env": {
        "AETOS_API_BASE_URL": "http://localhost:3000",
        "AETOS_ORG_ID": "<your organization id>",
        "AETOS_SERVICE_TOKEN": "<a service-role bearer token>"
      }
    }
  }
}
```

## Connect from Codex

Codex CLI reads MCP servers from `~/.codex/config.toml`:

```toml
[mcp_servers.aetos-one-clinics]
command = "node"
args = ["/absolute/path/to/apps/mcp-server/dist/index.js"]
env = { AETOS_API_BASE_URL = "http://localhost:3000", AETOS_ORG_ID = "<org id>", AETOS_SERVICE_TOKEN = "<token>" }
```

## Tools exposed

| Tool | Purpose |
|---|---|
| `list_addons` | List every add-on in the registry with this clinic's enabled/config state |
| `enable_addon` / `disable_addon` | Toggle an add-on (OWNER/ADMIN only, enforced server-side) |
| `configure_addon` | Set an add-on's config fields (API keys, provider choice) |
| `check_addon_health` | Ping an add-on's health endpoint |
| `list_patients` / `search_patients` | Look up patients by name/phone/ABHA |
| `get_queue` | Today's appointment queue for a location, triage-sorted |
| `get_branding` / `update_branding` | Read/update white-label settings (name, logo, colors, domain) |
| `list_users` / `update_user_role` | RBAC user management |

Build it with `npm run build -w apps/mcp-server` from the repo root.
