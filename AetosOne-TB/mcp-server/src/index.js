#!/usr/bin/env node
/**
 * Copyright © 2016-2026 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const http = require('http');
const {AetosClient} = require('./client');
const {McpServer} = require('./server');

const config = {
  baseUrl: process.env.AETOS_URL || 'http://localhost:8080',
  username: process.env.AETOS_USERNAME,
  password: process.env.AETOS_PASSWORD,
  allowWrites: process.env.AETOS_MCP_ALLOW_WRITES === 'true',
  httpPort: process.env.AETOS_MCP_HTTP_PORT ? Number(process.env.AETOS_MCP_HTTP_PORT) : null
};

/**
 * stdout carries the JSON-RPC stream, so every diagnostic must go to stderr. Writing a
 * single stray line to stdout corrupts the protocol and the client disconnects with no
 * useful error.
 */
const log = (...args) => process.stderr.write(args.join(' ') + '\n');

async function main() {
  if (!config.username || !config.password) {
    log('AETOS_USERNAME and AETOS_PASSWORD must be set.');
    process.exit(1);
  }

  const client = new AetosClient(config);
  try {
    await client.login();
  } catch (error) {
    log(`Could not sign in to ${config.baseUrl}: ${error.message}`);
    process.exit(1);
  }

  const server = new McpServer(client, config.allowWrites);
  const writable = config.allowWrites && client.isAdmin;
  log(`Aetos One Cloud MCP server ready — ${client.user.email} (${client.user.authority}), ` +
      `${server.availableTools.length} tools, ${writable ? 'read/write' : 'read-only'}.`);
  if (config.allowWrites && !client.isAdmin) {
    log('Writes were requested but this account is not an administrator; staying read-only.');
  }

  if (config.httpPort) {
    startHttp(server, config.httpPort);
  } else {
    startStdio(server);
  }
}

/** Transport used by Claude Desktop and Claude Code: newline-delimited JSON on stdio. */
function startStdio(server) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        handleLine(server, line);
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

async function handleLine(server, line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    log(`Ignoring unparseable input: ${line.slice(0, 120)}`);
    return;
  }
  const response = await server.handle(request);
  if (response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

/**
 * Streamable HTTP, for clients that connect over the network rather than by spawning a
 * process. Bound to localhost by default: this endpoint speaks with the credentials of the
 * account it signed in as, so exposing it publicly would hand those rights to anyone.
 */
function startHttp(server, port) {
  const httpServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/mcp')) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'POST /mcp only'}));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      let request;
      try {
        request = JSON.parse(body);
      } catch {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({jsonrpc: '2.0', id: null,
          error: {code: -32700, message: 'Parse error'}}));
        return;
      }
      // a batch is a JSON array; each element is answered independently
      const response = Array.isArray(request)
        ? (await Promise.all(request.map(item => server.handle(item)))).filter(Boolean)
        : await server.handle(request);

      if (!response || (Array.isArray(response) && !response.length)) {
        res.writeHead(202).end();
        return;
      }
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(response));
    });
  });

  httpServer.listen(port, process.env.AETOS_MCP_HTTP_HOST || '127.0.0.1', () => {
    log(`Listening on http://${process.env.AETOS_MCP_HTTP_HOST || '127.0.0.1'}:${port}/mcp`);
  });
}

main().catch(error => {
  log(`Fatal: ${error.stack || error.message}`);
  process.exit(1);
});
