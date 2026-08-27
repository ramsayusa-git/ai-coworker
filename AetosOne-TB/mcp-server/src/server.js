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

const {TOOLS} = require('./tools');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {name: 'aetos-one-cloud', version: '1.0.0'};

/**
 * MCP request handling, transport-independent.
 *
 * Implements the protocol directly over JSON-RPC rather than pulling in the SDK. The surface
 * needed here is three methods, and a dependency-free server installs and runs anywhere the
 * platform does — including an air-gapped deployment, which is the usual case for this kind
 * of system.
 */
class McpServer {

  /**
   * @param client       an authenticated AetosClient
   * @param allowWrites  operator opt-in; write tools also require an administrator account
   */
  constructor(client, allowWrites) {
    this.client = client;
    this.allowWrites = allowWrites;
  }

  /**
   * Tools this session may use.
   *
   * Write tools are withheld unless writes are enabled *and* the account is administrative.
   * Hiding them rather than failing on call means the model is never tempted to try, and the
   * client's tool list is an honest statement of what this session can do.
   */
  get availableTools() {
    const writesPermitted = this.allowWrites && this.client.isAdmin;
    return TOOLS.filter(tool => !tool.write || writesPermitted);
  }

  async handle(request) {
    const {id, method, params} = request;
    try {
      switch (method) {
        case 'initialize':
          return this._result(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {tools: {}},
            serverInfo: SERVER_INFO,
            instructions: this._instructions()
          });

        case 'notifications/initialized':
        case 'notifications/cancelled':
          // notifications carry no id and expect no response
          return null;

        case 'ping':
          return this._result(id, {});

        case 'tools/list':
          return this._result(id, {
            tools: this.availableTools.map(({name, description, inputSchema}) =>
              ({name, description, inputSchema}))
          });

        case 'tools/call':
          return this._result(id, await this._callTool(params));

        default:
          return this._error(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return this._error(id, -32603, error.message);
    }
  }

  async _callTool(params) {
    const tool = this.availableTools.find(candidate => candidate.name === params?.name);
    if (!tool) {
      const known = TOOLS.find(candidate => candidate.name === params?.name);
      // distinguishing "no such tool" from "not permitted here" is the difference between
      // the model retrying pointlessly and the operator learning to enable writes
      const reason = known
        ? `Tool "${params.name}" makes changes and is not enabled for this session. ` +
          `Set AETOS_MCP_ALLOW_WRITES=true and sign in as a tenant or system administrator.`
        : `Unknown tool: ${params?.name}`;
      return {content: [{type: 'text', text: reason}], isError: true};
    }

    try {
      const result = await tool.handler(this.client, params.arguments || {});
      return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
    } catch (error) {
      // reported as a tool error rather than a protocol error, so the model can read the
      // message and adjust instead of the whole call failing opaquely
      return {
        content: [{type: 'text', text: `${tool.name} failed: ${error.message}`}],
        isError: true
      };
    }
  }

  _instructions() {
    const writesPermitted = this.allowWrites && this.client.isAdmin;
    return [
      `Aetos One Cloud IoT platform at ${this.client.baseUrl}.`,
      `Signed in as ${this.client.user.email} (${this.client.user.authority}).`,
      writesPermitted
        ? 'Read and write tools are available. Confirm with the user before creating, ' +
          'deleting or changing anything.'
        : 'Read-only session: no tool here can change platform state.',
      'Results are scoped by the signed-in user\'s permissions, so an empty list may mean ' +
      '"not permitted" rather than "nothing exists".'
    ].join(' ');
  }

  _result(id, result) {
    return {jsonrpc: '2.0', id, result};
  }

  _error(id, code, message) {
    return {jsonrpc: '2.0', id, error: {code, message}};
  }

}

module.exports = {McpServer, PROTOCOL_VERSION, SERVER_INFO};
