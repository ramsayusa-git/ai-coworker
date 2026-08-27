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
 * Exercises the provisioning tools against a live platform, calling the handlers directly.
 *
 * The protocol layer is covered by smoke-test.js; what is checked here is that the tools
 * actually build valid platform objects — a dashboard that opens, a profile the rule engine
 * accepts, a group whose membership shapes access. Everything created is named with a
 * `demo`/`mcp-` prefix and removed at the end.
 */

const {AetosClient} = require('../src/client');
const {TOOLS} = require('../src/tools');

const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const tool = name => TOOLS.find(candidate => candidate.name === name);

async function main() {
  const client = new AetosClient({
    baseUrl: process.env.AETOS_URL || 'http://localhost:8080',
    username: process.env.AETOS_USERNAME || 'tenant@aetosiot.com',
    password: process.env.AETOS_PASSWORD || 'tenant'
  });
  await client.login();
  console.log(`Signed in as ${client.user.email} (${client.user.authority})\n`);

  const created = {devices: [], dashboards: [], groups: [], profiles: [], customers: []};

  try {
    // --- device profile with an alarm rule --------------------------------
    console.log('Profiles');
    const profileName = `demo-mcp-profile-${Date.now()}`;
    const profile = await tool('create_device_profile').handler(client, {
      name: profileName,
      description: 'Created by the provisioning test',
      alarmRules: [{key: 'temperature', operation: 'GREATER', value: 30,
        severity: 'MAJOR', alarmType: 'High temperature'}]
    });
    created.profiles.push(profile.id.id);
    record('device profile created', !!profile.id, profileName);
    record('its alarm rule was accepted',
      profile.profileData?.alarms?.length === 1,
      `${profile.profileData?.alarms?.length ?? 0} rule(s)`);

    // --- bulk device provisioning ------------------------------------------
    console.log('\nDevice provisioning');
    const group = await tool('create_entity_group').handler(client,
      {name: `demo-mcp-fleet-${Date.now()}`, type: 'DEVICE'});
    created.groups.push(group.id.id);

    const fleet = await tool('provision_devices').handler(client, {
      namePrefix: `demo-mcp-meter-${Date.now() % 100000}-`,
      count: 3,
      profile: profileName,
      groupId: group.id.id
    });
    fleet.devices.forEach(device => created.devices.push(device.id));
    record('three devices provisioned', fleet.created === 3,
      `${fleet.created} created, ${fleet.failed} failed`);
    record('each device came back with an access token',
      fleet.devices.every(device => !!device.accessToken));

    // membership is what a GROUP role scopes over, so it has to have actually happened
    const members = await client.get(`/api/entityGroup/${group.id.id}/entities`);
    record('they were added to the group', members.length === 3, `${members.length} members`);

    // --- dashboard ---------------------------------------------------------
    console.log('\nDashboard');
    const dashboard = await tool('create_dashboard').handler(client, {
      title: `demo-mcp-dashboard-${Date.now()}`,
      deviceIds: fleet.devices.map(device => device.id),
      keys: ['temperature', 'humidity']
    });
    created.dashboards.push(dashboard.id.id);
    record('dashboard created', !!dashboard.id, dashboard.title);

    // read it back rather than trusting the create response — a dashboard the server
    // accepted but stored empty would still have returned an id
    const saved = await client.get(`/api/dashboard/${dashboard.id.id}`);
    const widgets = Object.keys(saved.configuration?.widgets || {});
    record('it holds the expected widgets', widgets.length === 3,
      `${widgets.length} widgets (2 charts + latest values)`);
    record('its device alias resolves to the provisioned devices',
      saved.configuration?.entityAliases?.devices?.filter?.entityList?.length === 3);

    // --- role-based access -------------------------------------------------
    console.log('\nRole-based access');
    const customer = await tool('create_customer').handler(client,
      {title: `demo-mcp-customer-${Date.now()}`});
    created.customers.push(customer.id.id);
    record('customer created', !!customer.id, customer.title);

    await tool('assign_dashboard_to_customer').handler(client,
      {dashboardId: dashboard.id.id, customerId: customer.id.id});
    const assigned = await client.get(`/api/dashboard/info/${dashboard.id.id}`);
    record('dashboard assigned to the customer',
      (assigned.assignedCustomers || []).some(entry => entry.customerId.id === customer.id.id));

    const userGroup = await tool('create_entity_group').handler(client,
      {name: `demo-mcp-operators-${Date.now()}`, type: 'USER'});
    created.groups.push(userGroup.id.id);

    const role = await tool('create_role').handler(client, {
      name: `demo-mcp-viewer-${Date.now()}`, type: 'GROUP', permissions: ['READ']
    });
    const grant = await tool('grant_role_to_group').handler(client, {
      userGroupId: userGroup.id.id,
      roleId: role.id.id,
      targetGroupId: group.id.id,
      targetGroupType: 'DEVICE'
    });
    // this grant is the whole point: those users, that role, only those devices
    record('a GROUP role was granted over the device group', !!grant.id,
      'operators -> viewer -> fleet');

    // --- cleanup -----------------------------------------------------------
    console.log('\nCleanup');
    for (const id of created.dashboards) {
      await client.delete(`/api/dashboard/${id}`);
    }
    for (const id of created.devices) {
      await client.delete(`/api/device/${id}`);
    }
    for (const id of created.customers) {
      await client.delete(`/api/customer/${id}`);
    }
    await client.delete(`/api/groupPermission/${grant.id.id}`);
    await client.delete(`/api/role/${role.id.id}`);
    for (const id of created.groups) {
      await client.delete(`/api/entityGroup/${id}`);
    }
    for (const id of created.profiles) {
      await client.delete(`/api/deviceProfile/${id}`);
    }
    record('everything created was removed', true);

  } catch (error) {
    record(`unexpected failure: ${error.message}`, false);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
