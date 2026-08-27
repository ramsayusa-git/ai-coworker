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

/**
 * Drives the MCP server the way a client does — spawn it, speak JSON-RPC on stdio, read the
 * answers. Tests the protocol and the permission gate together, because that pairing is
 * where the interesting mistakes live.
 *
 * Needs a running backend:  node test/smoke-test.js
 */

const {spawn} = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'src', 'index.js');
const results = [];

function record(name, ok, detail = '') {
  results.push({name, ok});
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Runs one session against a freshly spawned server and returns the responses in order. */
function session(env, requests) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], {
      env: {...process.env, ...env},
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const responses = [];
    let buffer = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          responses.push(JSON.parse(line));
        }
      }
      // the server answers one line per request, so completion is countable
      if (responses.length >= requests.filter(r => r.id !== undefined).length) {
        child.kill();
        resolve({responses, stderr});
      }
    });

    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('exit', () => resolve({responses, stderr}));

    // give the server a moment to sign in before speaking to it
    setTimeout(() => {
      for (const request of requests) {
        child.stdin.write(JSON.stringify(request) + '\n');
      }
    }, 2500);

    setTimeout(() => {
      child.kill();
      resolve({responses, stderr});
    }, 25000);
  });
}

const base = {
  AETOS_URL: process.env.AETOS_URL || 'http://localhost:8080',
  AETOS_USERNAME: process.env.AETOS_USERNAME || 'tenant@aetosiot.com',
  AETOS_PASSWORD: process.env.AETOS_PASSWORD || 'tenant'
};

async function main() {
  console.log('Read-only session');
  const readOnly = await session({...base, AETOS_MCP_ALLOW_WRITES: 'false'}, [
    {jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {protocolVersion: '2024-11-05', capabilities: {}}},
    {jsonrpc: '2.0', id: 2, method: 'tools/list'},
    {jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {name: 'whoami', arguments: {}}},
    {jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: {name: 'list_devices', arguments: {limit: 5}}},
    {jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: {name: 'create_device', arguments: {name: 'mcp-should-not-exist'}}}
  ]);

  const byId = new Map(readOnly.responses.map(response => [response.id, response]));
  const initialize = byId.get(1);
  record('initialize handshake', !!initialize?.result?.serverInfo,
    initialize?.result?.serverInfo?.name);
  record('advertises tool capability', !!initialize?.result?.capabilities?.tools);

  const tools = byId.get(2)?.result?.tools || [];
  record('lists read tools', tools.some(tool => tool.name === 'list_devices'),
    `${tools.length} tools`);
  record('withholds write tools when writes are off',
    !tools.some(tool => tool.name === 'create_device'));

  const whoami = byId.get(3)?.result;
  record('whoami returns the signed-in user', !whoami?.isError,
    (whoami?.content?.[0]?.text || '').slice(0, 60).replace(/\s+/g, ' '));

  const devices = byId.get(4)?.result;
  record('list_devices returns data', !devices?.isError,
    (devices?.content?.[0]?.text || '').slice(0, 60).replace(/\s+/g, ' '));

  const refused = byId.get(5)?.result;
  record('a write tool is refused, with a reason', refused?.isError === true,
    (refused?.content?.[0]?.text || '').slice(0, 90));

  console.log('\nRead/write session');
  const readWrite = await session({...base, AETOS_MCP_ALLOW_WRITES: 'true'}, [
    {jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {protocolVersion: '2024-11-05', capabilities: {}}},
    {jsonrpc: '2.0', id: 2, method: 'tools/list'}
  ]);
  const rwTools = new Map(readWrite.responses.map(r => [r.id, r])).get(2)?.result?.tools || [];
  record('offers write tools to an administrator',
    rwTools.some(tool => tool.name === 'create_device'), `${rwTools.length} tools`);
  record('read tools remain available',
    rwTools.some(tool => tool.name === 'list_devices'));

  const passed = results.filter(result => result.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
