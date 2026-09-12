#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createApiClient } from './api-client';

const server = new McpServer({
  name: 'aetos-one-clinics',
  version: '0.1.0',
});

const api = createApiClient();

// ---------------------------------------------------------------------------
// Add-on supervisor tools
// ---------------------------------------------------------------------------

server.tool(
  'list_addons',
  'List every AI add-on in the registry with this clinic’s enabled state, config, and last health check.',
  {},
  async () => {
    const res = await api.get('/addons');
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

server.tool(
  'enable_addon',
  'Enable an add-on for this clinic by slug (e.g. "ai-scribe", "med-safety"). Requires OWNER/ADMIN.',
  { slug: z.string() },
  async ({ slug }) => {
    const res = await api.patch(`/addons/${slug}/enabled`, { enabled: true });
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

server.tool(
  'disable_addon',
  'Disable an add-on for this clinic by slug. Requires OWNER/ADMIN.',
  { slug: z.string() },
  async ({ slug }) => {
    const res = await api.patch(`/addons/${slug}/enabled`, { enabled: false });
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

server.tool(
  'configure_addon',
  'Set config values for an add-on (API keys, provider choice, etc). Pass exactly the keys the add-on’s configSchema defines.',
  { slug: z.string(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) },
  async ({ slug, config }) => {
    const res = await api.patch(`/addons/${slug}/config`, config);
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

server.tool(
  'check_addon_health',
  'Ping an add-on’s health endpoint and record the result.',
  { slug: z.string() },
  async ({ slug }) => {
    const res = await api.post(`/addons/${slug}/health-check`);
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Patients / queue
// ---------------------------------------------------------------------------

server.tool(
  'search_patients',
  'Search patients by phone number or ABHA number/address.',
  { query: z.string() },
  async ({ query }) => {
    const res = await api.get('/patients', { params: { q: query } });
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

server.tool(
  'get_queue',
  'Get the appointment queue for a location on a given date (ISO date, defaults to today), triage-sorted.',
  { locationId: z.string(), date: z.string().optional() },
  async ({ locationId, date }) => {
    const res = await api.get('/appointments/queue', { params: { locationId, date } });
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// White-label branding
// ---------------------------------------------------------------------------

server.tool('get_branding', 'Get this clinic’s white-label branding (product name, logo, colors, custom domain).', {}, async () => {
  const res = await api.get('/branding');
  return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
});

server.tool(
  'update_branding',
  'Update white-label branding fields. Requires OWNER/ADMIN.',
  {
    productName: z.string().optional(),
    logoUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    customDomain: z.string().optional(),
    supportEmail: z.string().optional(),
    supportPhone: z.string().optional(),
    hidePoweredBy: z.boolean().optional(),
  },
  async (fields) => {
    const res = await api.put('/branding', fields);
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Users / RBAC
// ---------------------------------------------------------------------------

server.tool('list_users', 'List users in this clinic with their RBAC role. Requires OWNER/ADMIN.', {}, async () => {
  const res = await api.get('/users');
  return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
});

server.tool(
  'update_user_role',
  'Change a user’s RBAC role: OWNER, ADMIN, DOCTOR, or FRONT_DESK. Requires OWNER.',
  { userId: z.string(), role: z.enum(['OWNER', 'ADMIN', 'DOCTOR', 'FRONT_DESK']) },
  async ({ userId, role }) => {
    const res = await api.patch(`/users/${userId}/role`, { role });
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Aetos One Clinics MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting Aetos One Clinics MCP server:', err);
  process.exit(1);
});
