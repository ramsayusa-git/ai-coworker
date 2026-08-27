# Aetos One Cloud — MCP server

Lets Claude (and any other MCP client) read and manage the platform: devices, telemetry,
alarms, dashboards, users, access control and scheduled events.

No dependencies. Node 18+ and nothing else — `npm install` is not required, which matters
for the air-gapped deployments this platform usually runs in.

---

## How it is wired

The server signs in to the **REST API** as a real user and makes every call as that user.
It does not touch the database.

That is the whole security model:

- an MCP client sees exactly what that account sees — RBAC row scoping, tenant isolation and
  authority checks all apply unchanged;
- there is no second enforcement path that could drift out of step with the first;
- revoking the account revokes the AI client.

**Write tools are withheld unless two things are true**: `AETOS_MCP_ALLOW_WRITES=true`, and
the account is a `TENANT_ADMIN`, `SYS_ADMIN` or `SUPER_ADMIN`. Otherwise they are not listed
at all, so a model cannot try and fail — it simply does not see them.

---

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `AETOS_USERNAME` | yes | — | Account the session acts as |
| `AETOS_PASSWORD` | yes | — | Its password |
| `AETOS_URL` | no | `http://localhost:8080` | Platform base URL |
| `AETOS_MCP_ALLOW_WRITES` | no | `false` | Opt in to write tools |
| `AETOS_MCP_HTTP_PORT` | no | — | Serve over HTTP instead of stdio |
| `AETOS_MCP_HTTP_HOST` | no | `127.0.0.1` | Bind address for HTTP mode |

Give the AI client **its own user account**, not a shared admin login. Then the audit log
attributes its actions to it, and access can be withdrawn without disturbing anyone else.

---

## Claude Desktop / Claude Code

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aetos-one-cloud": {
      "command": "node",
      "args": ["/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/mcp-server/src/index.js"],
      "env": {
        "AETOS_URL": "http://localhost:8080",
        "AETOS_USERNAME": "ai-agent@yourcompany.com",
        "AETOS_PASSWORD": "…",
        "AETOS_MCP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add aetos-one-cloud \
  --env AETOS_URL=http://localhost:8080 \
  --env AETOS_USERNAME=ai-agent@yourcompany.com \
  --env AETOS_PASSWORD=… \
  -- node /run/media/krishna/data-backup/claude-cowork/AetosOne-TB/mcp-server/src/index.js
```

## Other AI providers

Set `AETOS_MCP_HTTP_PORT` and the server speaks JSON-RPC over `POST /mcp`, which any MCP
client can drive:

```bash
AETOS_MCP_HTTP_PORT=9090 node src/index.js

curl -s localhost:9090/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

It binds to localhost by default and **has no authentication of its own** — it acts with the
credentials it signed in with, so anyone who can reach the port inherits them. Put it behind
a reverse proxy that authenticates before exposing it beyond the machine.

---

## Tools

**Read (always available)**

| Tool | Answers |
|---|---|
| `whoami` | Who this session is, and whether it can write |
| `list_devices` | Devices, with a name search |
| `get_device` | One device plus its server attributes |
| `get_telemetry` | Latest values |
| `get_telemetry_history` | Values over a time range, for trends |
| `list_alarms` | What is currently wrong |
| `list_assets`, `list_dashboards`, `list_customers`, `list_users` | Inventory |
| `list_scheduler_events` | What is scheduled, and how the last run went |
| `list_access_control` | Entity groups and roles |
| `get_my_permissions` | What this account may read |

**Write (administrators, opt-in)**

| Tool | Effect |
|---|---|
| `create_device` | Creates a device, returns its access token |
| `delete_device` | Permanent, including telemetry |
| `post_telemetry` | Posts readings to an entity |
| `update_attributes` | Writes attributes in a chosen scope |
| `acknowledge_alarm`, `clear_alarm` | Alarm workflow |
| `create_scheduler_event`, `delete_scheduler_event` | Scheduled work |
| `create_entity_group`, `create_role` | Access control |

**Provisioning (administrators, opt-in)**

| Tool | Effect |
|---|---|
| `provision_devices` | Creates a fleet from a name prefix, optionally into a group, returning every access token |
| `create_device_profile` | Profile with optional threshold alarm rules |
| `create_asset_profile` | Asset profile |
| `create_dashboard` | Builds charts and a latest-values card from device ids and telemetry keys |
| `assign_dashboard_to_customer` | Puts a dashboard in a customer's menu |
| `add_entities_to_group` | Shapes what a GROUP role reaches |
| `grant_role_to_group` | Binds a user group to a role, generically or over one group |
| `create_customer` | Creates a customer |
| `create_user` | Creates a user, optionally into a group, returns the activation link |

Generated dashboards are ordinary dashboards: the user can open the visual editor and change
anything. The tool is there to skip the tedious first draft, not to own the result.

### Role-based dashboards, end to end

The pieces above compose into the usual setup, in one conversation:

1. `provision_devices` — create the fleet, into a device group
2. `create_dashboard` — chart the keys that matter
3. `create_customer` + `assign_dashboard_to_customer` — the customer gets the dashboard
4. `create_entity_group` (USER) + `create_role` (GROUP) + `grant_role_to_group` — those users
   see exactly those devices, and nothing else
5. `create_user` into that group — they sign in to a menu containing only what they may use

---

## Testing

```bash
node test/smoke-test.js          # protocol and the permission gate
node test/provisioning-test.js   # provisioning against a live platform
```

The smoke test spawns the server and speaks JSON-RPC to it, checking the handshake, the tool
list, a couple of real calls, and — the part worth having — that a write tool is refused in a
read-only session and offered in an administrative one.

The provisioning test creates a profile, a fleet, a dashboard, a customer and a grant, reads
each back to confirm the platform stored what was intended, then deletes everything. It names
what it creates with a `demo-mcp-` prefix.
