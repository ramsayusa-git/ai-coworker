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
 * Thin REST client for Aetos One Cloud.
 *
 * Deliberately goes through the public REST API rather than the database. Every call is
 * then subject to the same authority checks and RBAC row scoping as the web UI — an AI
 * client cannot see or change anything the signed-in user could not, and there is no second
 * enforcement path to keep in sync with the first.
 */
class AetosClient {

  constructor({baseUrl, username, password}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.token = null;
    this.refreshToken = null;
    this.user = null;
  }

  async login() {
    const response = await this._fetch('/api/auth/login', {
      method: 'POST',
      body: {username: this.username, password: this.password},
      auth: false
    });
    this.token = response.token;
    this.refreshToken = response.refreshToken;
    this.user = await this.get('/api/auth/user');
    return this.user;
  }

  /** True when the signed-in user may perform administrative writes. */
  get isAdmin() {
    return ['TENANT_ADMIN', 'SYS_ADMIN', 'SUPER_ADMIN'].includes(this.user?.authority);
  }

  get(path) {
    return this._fetch(path, {method: 'GET'});
  }

  post(path, body) {
    return this._fetch(path, {method: 'POST', body});
  }

  delete(path) {
    return this._fetch(path, {method: 'DELETE'});
  }

  async _fetch(path, {method, body, auth = true, retry = true}) {
    const headers = {'Content-Type': 'application/json'};
    if (auth && this.token) {
      headers['X-Authorization'] = `Bearer ${this.token}`;
    }
    const response = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    // tokens are short-lived; one silent re-login keeps a long-running MCP session working
    if (response.status === 401 && auth && retry) {
      await this.login();
      return this._fetch(path, {method, body, auth, retry: false});
    }

    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const message = parsed && parsed.message ? parsed.message : `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return parsed;
  }

}

module.exports = {AetosClient};
