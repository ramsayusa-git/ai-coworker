#!/usr/bin/env node
/**
 * FreshRice MCP server — lets Claude (Desktop, Cowork, Code) operate the FreshRice platform.
 *
 * Transports: stdio (default; for claude_desktop_config.json) or --http (Streamable HTTP on MCP_PORT, for remote/Cowork).
 * Auth to the API: FRESHRICE_API_KEY (a frk_… service key from Admin → Settings → API keys). The key's linked
 * staff role + scopes decide what Claude can do — a read-only key makes every write tool fail with 403.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import { registerTools } from './tools.js';

const API = (process.env.FRESHRICE_API_URL || 'http://localhost:4100').replace(/\/$/, '');
const KEY = process.env.FRESHRICE_API_KEY || '';
if (!KEY) { console.error('FRESHRICE_API_KEY is required (create one at /admin/api-keys)'); process.exit(1); }

export async function api(path: string, opts: { method?: string; body?: any; raw?: boolean } = {}): Promise<any> {
  const r = await fetch(`${API}/v1${path}`, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (opts.raw) return r;
  const text = await r.text(); let data: any = text; try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`${r.status} ${typeof data === 'object' ? data.message || JSON.stringify(data) : data}`);
  return data;
}

function build() {
  const server = new McpServer({ name: 'freshrice', version: '0.1.0' }, { instructions: 'FreshRice is a mill-direct rice delivery business in Hyderabad. Money fields ending in "Paise" are in paise (₹1 = 100 paise). Dates are ISO. Use freshrice_daily_brief first for an overview. Write tools are audited under the API key\'s linked user.' });
  registerTools(server, api, z);
  return server;
}

async function main() {
  if (process.argv.includes('--http')) {
    const app = express(); app.use(express.json({ limit: '2mb' }));
    const token = process.env.MCP_BEARER; // optional extra gate for the HTTP transport
    app.all('/mcp', async (req, res) => {
      if (token && req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
      const server = build(); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport); await transport.handleRequest(req, res, req.body);
    });
    app.get('/health', (_req, res) => res.json({ ok: true, api: API }));
    const port = Number(process.env.MCP_PORT || 4300);
    app.listen(port, () => console.error(`FreshRice MCP (http) on http://localhost:${port}/mcp → ${API}`));
  } else {
    const server = build(); await server.connect(new StdioServerTransport()); console.error(`FreshRice MCP (stdio) → ${API}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
