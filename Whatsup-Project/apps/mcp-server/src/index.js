#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.WHATSUP_API_URL || "http://localhost:4000";
const WHATSUP_EMAIL = process.env.WHATSUP_EMAIL;
const WHATSUP_PASSWORD = process.env.WHATSUP_PASSWORD;

let cachedToken = null;
let cachedMe = null;

// Every /v1/orgs/:orgId/* route requires a Bearer JWT now (auth was added after this
// server was first built). Log in once with the configured credentials, cache the
// token + resolved org, and transparently re-login once if a call comes back 401
// (token expired, or the API restarted and rejected a stale cached token).
async function login() {
  if (!WHATSUP_EMAIL || !WHATSUP_PASSWORD) {
    throw new Error(
      "WHATSUP_EMAIL and WHATSUP_PASSWORD are not configured. Set them in the Whatsup extension's settings (or env vars) to sign in."
    );
  }
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: WHATSUP_EMAIL, password: WHATSUP_PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  cachedToken = data.token;
  cachedMe = data.user;
  return cachedToken;
}

async function getSession() {
  if (!cachedToken) await login();
  return { token: cachedToken, orgId: cachedMe.orgId };
}

async function authedFetch(path, init) {
  const { token } = await getSession();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

async function api(path, init) {
  const { orgId } = await getSession();
  let res = await authedFetch(`/v1/orgs/${orgId}${path}`, init);
  if (res.status === 401) {
    // Token expired or API restarted (JWT_SECRET unchanged normally, but be defensive) — re-login once.
    cachedToken = null;
    cachedMe = null;
    res = await authedFetch(`/v1/orgs/${(await getSession()).orgId}${path}`, init);
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`API ${res.status}: ${text}`);
  return body;
}

function tj(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const server = new Server(
  { name: "whatsup", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "whatsup_get_org",
    description: "Get the current Whatsup organization (name, plan, wallet). Use this first to confirm what you're managing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_list_contacts",
    description: "List all WhatsApp contacts for the org (name, phone, tags, stage, opt-in status).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_add_contact",
    description: "Add a new contact to the org.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phoneE164: { type: "string", description: "Phone in E.164 format, e.g. +919876543210" },
        email: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        stage: { type: "string", enum: ["lead", "customer", "vip"] },
      },
      required: ["name", "phoneE164"],
    },
  },
  {
    name: "whatsup_list_channels",
    description: "List connected WhatsApp channels (Official Meta numbers and Quick Connect numbers) with health status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_list_conversations",
    description: "List inbox conversations with status, unread count, last message, and the 24h service window expiry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_get_conversation_messages",
    description: "Get the full message history for one conversation.",
    inputSchema: {
      type: "object",
      properties: { conversationId: { type: "string" } },
      required: ["conversationId"],
    },
  },
  {
    name: "whatsup_send_message",
    description: "Send a free-form outbound WhatsApp message in an existing conversation. Only works while the 24h service window is open; otherwise use a template via whatsup_create_campaign.",
    inputSchema: {
      type: "object",
      properties: { conversationId: { type: "string" }, body: { type: "string" } },
      required: ["conversationId", "body"],
    },
  },
  {
    name: "whatsup_list_templates",
    description: "List WhatsApp message templates and their Meta approval status (approved/pending/rejected/draft).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_create_template",
    description: "Submit a new WhatsApp message template for approval. Use {{1}}, {{2}}, etc. for variables in the body.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "snake_case template name" },
        category: { type: "string", enum: ["marketing", "utility", "authentication"] },
        body: { type: "string" },
        language: { type: "string", description: "default: en" },
      },
      required: ["name", "category", "body"],
    },
  },
  {
    name: "whatsup_list_campaigns",
    description: "List broadcast campaigns with status and delivery/read/failed stats.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whatsup_create_campaign",
    description: "Create a broadcast campaign against an approved template and a segment. Leave scheduledAt empty to save as a draft.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        templateId: { type: "string", description: "Get from whatsup_list_templates (must be status=approved)" },
        segment: { type: "string" },
        audienceCount: { type: "number" },
        scheduledAt: { type: "string", description: "ISO 8601 datetime, or omit for draft" },
      },
      required: ["name", "templateId", "segment"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "whatsup_get_org": {
        await getSession(); // ensures we're logged in
        const res = await authedFetch("/v1/me");
        const body = await res.json();
        if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(body)}`);
        return tj(body);
      }
      case "whatsup_list_contacts":
        return tj(await api("/contacts"));
      case "whatsup_add_contact":
        return tj(await api("/contacts", { method: "POST", body: JSON.stringify(args) }));
      case "whatsup_list_channels":
        return tj(await api("/channels"));
      case "whatsup_list_conversations":
        return tj(await api("/conversations"));
      case "whatsup_get_conversation_messages":
        return tj(await api(`/conversations/${args.conversationId}/messages`));
      case "whatsup_send_message":
        return tj(await api(`/conversations/${args.conversationId}/messages`, {
          method: "POST", body: JSON.stringify({ body: args.body }),
        }));
      case "whatsup_list_templates":
        return tj(await api("/templates"));
      case "whatsup_create_template":
        return tj(await api("/templates", { method: "POST", body: JSON.stringify(args) }));
      case "whatsup_list_campaigns":
        return tj(await api("/campaigns"));
      case "whatsup_create_campaign":
        return tj(await api("/campaigns", { method: "POST", body: JSON.stringify(args) }));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
