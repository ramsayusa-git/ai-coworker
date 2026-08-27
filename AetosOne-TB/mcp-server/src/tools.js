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
 * The tools this server exposes.
 *
 * Each entry declares whether it writes. Write tools are only offered when the operator has
 * opted in *and* the signed-in user is an administrator — a client cannot discover a tool it
 * would not be allowed to call, which is clearer than failing at call time.
 */

const page = (pageSize = 50, pageIndex = 0, textSearch) => {
  const params = new URLSearchParams({pageSize: String(pageSize), page: String(pageIndex)});
  if (textSearch) {
    params.set('textSearch', textSearch);
  }
  return `?${params.toString()}`;
};

/** Trims list responses to the fields that matter, so a page of devices is readable. */
const summarise = (data, fields) => (data || []).map(item => {
  const result = {};
  for (const field of fields) {
    const value = field.split('.').reduce((node, key) => (node ? node[key] : undefined), item);
    if (value !== undefined) {
      result[field] = value;
    }
  }
  return result;
});

const TOOLS = [
  // ---------------------------------------------------------------- read ---
  {
    name: 'whoami',
    write: false,
    description: 'Who this MCP session is signed in as, and what it is allowed to do.',
    inputSchema: {type: 'object', properties: {}},
    handler: async (client) => ({
      email: client.user.email,
      authority: client.user.authority,
      tenantId: client.user.tenantId?.id,
      canWrite: client.isAdmin,
      baseUrl: client.baseUrl
    })
  },
  {
    name: 'list_devices',
    write: false,
    description: 'List devices in the tenant, newest first. Supports a text search on name.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {type: 'string', description: 'Filter by device name'},
        limit: {type: 'number', description: 'Maximum devices to return (default 50)'}
      }
    },
    handler: async (client, args) => {
      const result = await client.get(
        `/api/tenant/deviceInfos${page(args.limit ?? 50, 0, args.search)}`);
      return {
        total: result.totalElements,
        devices: summarise(result.data, ['id.id', 'name', 'type', 'label', 'active'])
      };
    }
  },
  {
    name: 'get_device',
    write: false,
    description: 'Full detail for one device, including its current server attributes.',
    inputSchema: {
      type: 'object',
      properties: {deviceId: {type: 'string'}},
      required: ['deviceId']
    },
    handler: async (client, args) => {
      const device = await client.get(`/api/device/${args.deviceId}`);
      let attributes = [];
      try {
        attributes = await client.get(
          `/api/plugins/telemetry/DEVICE/${args.deviceId}/values/attributes/SERVER_SCOPE`);
      } catch {
        // a device the caller can read but whose attributes they cannot is still worth
        // returning; the missing section is more useful than an error
      }
      return {device, serverAttributes: attributes};
    }
  },
  {
    name: 'get_telemetry',
    write: false,
    description: 'Latest telemetry values for an entity. Omit keys to get every key.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {type: 'string', description: 'DEVICE, ASSET, ENTITY_VIEW, CUSTOMER…'},
        entityId: {type: 'string'},
        keys: {type: 'string', description: 'Comma-separated telemetry keys'}
      },
      required: ['entityId']
    },
    handler: async (client, args) => {
      const type = args.entityType || 'DEVICE';
      const suffix = args.keys ? `?keys=${encodeURIComponent(args.keys)}` : '';
      return client.get(
        `/api/plugins/telemetry/${type}/${args.entityId}/values/timeseries${suffix}`);
    }
  },
  {
    name: 'get_telemetry_history',
    write: false,
    description: 'Historical telemetry for an entity over a time range, for trend questions.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {type: 'string'},
        entityId: {type: 'string'},
        keys: {type: 'string', description: 'Comma-separated telemetry keys (required)'},
        hours: {type: 'number', description: 'How far back to look, in hours (default 24)'},
        limit: {type: 'number', description: 'Maximum points per key (default 200)'}
      },
      required: ['entityId', 'keys']
    },
    handler: async (client, args) => {
      const type = args.entityType || 'DEVICE';
      const endTs = Date.now();
      const startTs = endTs - (args.hours ?? 24) * 3600_000;
      const params = new URLSearchParams({
        keys: args.keys,
        startTs: String(startTs),
        endTs: String(endTs),
        limit: String(args.limit ?? 200),
        orderBy: 'ASC'
      });
      return client.get(
        `/api/plugins/telemetry/${type}/${args.entityId}/values/timeseries?${params}`);
    }
  },
  {
    name: 'list_alarms',
    write: false,
    description: 'Alarms across the tenant, most recent first. Use to answer "what is wrong?".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {type: 'number'},
        status: {type: 'string', description: 'ACTIVE_UNACK, ACTIVE_ACK, CLEARED_UNACK, CLEARED_ACK'}
      }
    },
    handler: async (client, args) => {
      const params = new URLSearchParams({
        pageSize: String(args.limit ?? 50), page: '0',
        sortProperty: 'createdTime', sortOrder: 'DESC'
      });
      if (args.status) {
        params.set('status', args.status);
      }
      const result = await client.get(`/api/alarms?${params}`);
      return {
        total: result.totalElements,
        alarms: summarise(result.data,
          ['id.id', 'name', 'type', 'severity', 'status', 'originatorName', 'createdTime'])
      };
    }
  },
  {
    name: 'list_assets',
    write: false,
    description: 'List assets in the tenant.',
    inputSchema: {
      type: 'object',
      properties: {search: {type: 'string'}, limit: {type: 'number'}}
    },
    handler: async (client, args) => {
      const result = await client.get(
        `/api/tenant/assetInfos${page(args.limit ?? 50, 0, args.search)}`);
      return {total: result.totalElements, assets: summarise(result.data, ['id.id', 'name', 'type', 'label'])};
    }
  },
  {
    name: 'list_dashboards',
    write: false,
    description: 'List dashboards in the tenant.',
    inputSchema: {
      type: 'object',
      properties: {search: {type: 'string'}, limit: {type: 'number'}}
    },
    handler: async (client, args) => {
      const result = await client.get(
        `/api/tenant/dashboards${page(args.limit ?? 50, 0, args.search)}`);
      return {total: result.totalElements, dashboards: summarise(result.data, ['id.id', 'title'])};
    }
  },
  {
    name: 'list_customers',
    write: false,
    description: 'List customers in the tenant.',
    inputSchema: {type: 'object', properties: {limit: {type: 'number'}}},
    handler: async (client, args) => {
      const result = await client.get(`/api/customers${page(args.limit ?? 50)}`);
      return {total: result.totalElements, customers: summarise(result.data, ['id.id', 'title', 'email'])};
    }
  },
  {
    name: 'list_users',
    write: false,
    description: 'List users in the tenant, with their authority.',
    inputSchema: {type: 'object', properties: {limit: {type: 'number'}}},
    handler: async (client, args) => {
      const result = await client.get(`/api/users${page(args.limit ?? 50)}`);
      return {
        total: result.totalElements,
        users: summarise(result.data, ['id.id', 'email', 'firstName', 'lastName', 'authority'])
      };
    }
  },
  {
    name: 'list_scheduler_events',
    write: false,
    description: 'Scheduled events, with their next and last run and the last outcome.',
    inputSchema: {type: 'object', properties: {limit: {type: 'number'}}},
    handler: async (client, args) => {
      const result = await client.get(`/api/schedulerEvents${page(args.limit ?? 50)}`);
      return {
        total: result.totalElements,
        events: summarise(result.data,
          ['id.id', 'name', 'type', 'enabled', 'nextFireTime', 'lastFireTime', 'lastResult'])
      };
    }
  },
  {
    name: 'list_access_control',
    write: false,
    description: 'Entity groups and roles, for questions about who can do what.',
    inputSchema: {type: 'object', properties: {}},
    handler: async (client) => {
      const [groups, roles] = await Promise.all([
        client.get(`/api/entityGroups${page(200)}`),
        client.get(`/api/roles${page(200)}`)
      ]);
      return {
        groups: summarise(groups.data, ['id.id', 'name', 'type', 'groupAll']),
        roles: summarise(roles.data, ['id.id', 'name', 'type', 'permissions'])
      };
    }
  },
  {
    name: 'get_my_permissions',
    write: false,
    description: 'Resources the signed-in user may read. Empty rbacEnabled means no grants apply.',
    inputSchema: {type: 'object', properties: {}},
    handler: async (client) => client.get('/api/permissions/allowedResources')
  },

  // --------------------------------------------------------------- write ---
  {
    name: 'create_device',
    write: true,
    description: 'Create a device. Returns the device and its access token.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', description: 'Device profile name (default "default")'},
        label: {type: 'string'}
      },
      required: ['name']
    },
    handler: async (client, args) => {
      const device = await client.post('/api/device', {
        name: args.name,
        type: args.type || 'default',
        label: args.label
      });
      const credentials = await client.get(`/api/device/${device.id.id}/credentials`);
      return {device, accessToken: credentials.credentialsId};
    }
  },
  {
    name: 'delete_device',
    write: true,
    description: 'Delete a device permanently, along with its telemetry.',
    inputSchema: {
      type: 'object',
      properties: {deviceId: {type: 'string'}},
      required: ['deviceId']
    },
    handler: async (client, args) => {
      await client.delete(`/api/device/${args.deviceId}`);
      return {deleted: args.deviceId};
    }
  },
  {
    name: 'post_telemetry',
    write: true,
    description: 'Post telemetry to an entity, as the platform would on receiving a reading.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {type: 'string'},
        entityId: {type: 'string'},
        values: {type: 'object', description: 'Key/value pairs, e.g. {"temperature": 21.5}'}
      },
      required: ['entityId', 'values']
    },
    handler: async (client, args) => {
      const type = args.entityType || 'DEVICE';
      await client.post(
        `/api/plugins/telemetry/${type}/${args.entityId}/timeseries/ANY`, args.values);
      return {posted: Object.keys(args.values)};
    }
  },
  {
    name: 'update_attributes',
    write: true,
    description: 'Write attributes on an entity. Scope defaults to SERVER_SCOPE.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {type: 'string'},
        entityId: {type: 'string'},
        scope: {type: 'string', description: 'SERVER_SCOPE, SHARED_SCOPE or CLIENT_SCOPE'},
        values: {type: 'object'}
      },
      required: ['entityId', 'values']
    },
    handler: async (client, args) => {
      const type = args.entityType || 'DEVICE';
      const scope = args.scope || 'SERVER_SCOPE';
      await client.post(
        `/api/plugins/telemetry/${type}/${args.entityId}/attributes/${scope}`, args.values);
      return {scope, written: Object.keys(args.values)};
    }
  },
  {
    name: 'acknowledge_alarm',
    write: true,
    description: 'Acknowledge an alarm.',
    inputSchema: {
      type: 'object',
      properties: {alarmId: {type: 'string'}},
      required: ['alarmId']
    },
    handler: async (client, args) => {
      await client.post(`/api/alarm/${args.alarmId}/ack`);
      return {acknowledged: args.alarmId};
    }
  },
  {
    name: 'clear_alarm',
    write: true,
    description: 'Clear an alarm.',
    inputSchema: {
      type: 'object',
      properties: {alarmId: {type: 'string'}},
      required: ['alarmId']
    },
    handler: async (client, args) => {
      await client.post(`/api/alarm/${args.alarmId}/clear`);
      return {cleared: args.alarmId};
    }
  },
  {
    name: 'create_scheduler_event',
    write: true,
    description:
      'Schedule work: an attribute write or telemetry post, once or repeating. ' +
      'startTime is epoch millis; repeat is {"type":"INTERVAL","intervalMs":N} or ' +
      '{"type":"CRON","cron":"0 0 * * * *","timezone":"UTC"}.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', description: 'updateAttributes or postTelemetry'},
        deviceId: {type: 'string', description: 'The device the action applies to'},
        startTime: {type: 'number'},
        repeat: {type: 'object'},
        configuration: {type: 'object', description: 'Payload for the chosen action'}
      },
      required: ['name', 'type', 'startTime', 'configuration']
    },
    handler: async (client, args) => {
      const schedule = {startTime: args.startTime};
      if (args.repeat) {
        schedule.repeat = args.repeat;
      }
      return client.post('/api/schedulerEvent', {
        name: args.name,
        type: args.type,
        originatorId: args.deviceId ? {entityType: 'DEVICE', id: args.deviceId} : null,
        enabled: true,
        schedule,
        configuration: args.configuration
      });
    }
  },
  {
    name: 'delete_scheduler_event',
    write: true,
    description: 'Delete a scheduled event.',
    inputSchema: {
      type: 'object',
      properties: {eventId: {type: 'string'}},
      required: ['eventId']
    },
    handler: async (client, args) => {
      await client.delete(`/api/schedulerEvent/${args.eventId}`);
      return {deleted: args.eventId};
    }
  },
  {
    name: 'create_entity_group',
    write: true,
    description: 'Create an entity group, the unit a GROUP role is granted over.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', description: 'DEVICE, ASSET, USER, CUSTOMER, DASHBOARD, ENTITY_VIEW, EDGE'}
      },
      required: ['name', 'type']
    },
    handler: async (client, args) => client.post('/api/entityGroup', {name: args.name, type: args.type})
  },
  {
    name: 'create_role',
    write: true,
    description:
      'Create a role. GENERIC takes {"DEVICE":["READ"]}; GROUP takes ["READ","WRITE"] and ' +
      'gets its meaning from the group it is later granted over.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', description: 'GENERIC or GROUP'},
        permissions: {description: 'Object for GENERIC, array for GROUP'}
      },
      required: ['name', 'type', 'permissions']
    },
    handler: async (client, args) => client.post('/api/role', {
      name: args.name, type: args.type, permissions: args.permissions
    })
  },

  // -------------------------------------------------------- provisioning ---
  {
    name: 'provision_devices',
    write: true,
    description:
      'Create many devices at once from a name prefix, optionally adding them to an entity ' +
      'group. Returns each device with its access token. Use for onboarding a fleet.',
    inputSchema: {
      type: 'object',
      properties: {
        namePrefix: {type: 'string', description: 'e.g. "meter-" produces meter-001, meter-002…'},
        count: {type: 'number', description: 'How many to create (max 200)'},
        startIndex: {type: 'number', description: 'First number to use (default 1)'},
        profile: {type: 'string', description: 'Device profile name (default "default")'},
        label: {type: 'string'},
        groupId: {type: 'string', description: 'Entity group to add them to'}
      },
      required: ['namePrefix', 'count']
    },
    handler: async (client, args) => {
      const count = Math.min(args.count, 200);
      const start = args.startIndex ?? 1;
      const width = String(start + count - 1).length;
      const created = [];
      const failed = [];

      for (let i = 0; i < count; i++) {
        const name = `${args.namePrefix}${String(start + i).padStart(width, '0')}`;
        try {
          const device = await client.post('/api/device', {
            name, type: args.profile || 'default', label: args.label
          });
          const credentials = await client.get(`/api/device/${device.id.id}/credentials`);
          if (args.groupId) {
            await client.post(`/api/entityGroup/${args.groupId}/DEVICE/${device.id.id}`);
          }
          created.push({name, id: device.id.id, accessToken: credentials.credentialsId});
        } catch (error) {
          // a name collision partway through should not discard the devices already made
          failed.push({name, reason: error.message});
        }
      }
      return {created: created.length, failed: failed.length, devices: created, errors: failed};
    }
  },
  {
    name: 'create_device_profile',
    write: true,
    description:
      'Create a device profile, optionally with threshold alarm rules. Each rule fires when ' +
      'a telemetry key crosses a value, e.g. {"key":"temperature","operation":"GREATER",' +
      '"value":30,"severity":"MAJOR","alarmType":"High temperature"}.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        description: {type: 'string'},
        alarmRules: {type: 'array', description: 'Threshold rules, see the description'}
      },
      required: ['name']
    },
    handler: async (client, args) => {
      const alarms = (args.alarmRules || []).map(rule => ({
        id: rule.alarmType || `${rule.key} alarm`,
        alarmType: rule.alarmType || `${rule.key} alarm`,
        createRules: {
          [rule.severity || 'MAJOR']: {
            condition: {
              condition: [{
                key: {type: 'TIME_SERIES', key: rule.key},
                valueType: 'NUMERIC',
                predicate: {
                  type: 'NUMERIC',
                  operation: rule.operation || 'GREATER',
                  value: {defaultValue: rule.value, dynamicValue: null}
                }
              }],
              spec: {type: 'SIMPLE'}
            },
            schedule: null,
            alarmDetails: null
          }
        },
        clearRule: null,
        propagate: false,
        propagateRelationTypes: null
      }));

      return client.post('/api/deviceProfile', {
        name: args.name,
        description: args.description,
        type: 'DEFAULT',
        transportType: 'DEFAULT',
        provisionType: 'DISABLED',
        profileData: {
          configuration: {type: 'DEFAULT'},
          transportConfiguration: {type: 'DEFAULT'},
          provisionConfiguration: {type: 'DISABLED', provisionDeviceSecret: null},
          alarms: alarms.length ? alarms : null
        }
      });
    }
  },
  {
    name: 'create_asset_profile',
    write: true,
    description: 'Create an asset profile.',
    inputSchema: {
      type: 'object',
      properties: {name: {type: 'string'}, description: {type: 'string'}},
      required: ['name']
    },
    handler: async (client, args) => client.post('/api/assetProfile', {
      name: args.name, description: args.description
    })
  },
  {
    name: 'create_dashboard',
    write: true,
    description:
      'Create a dashboard showing telemetry from chosen devices. Give it a title, the ' +
      'device ids, and the telemetry keys; it builds time-series charts and latest-value ' +
      'cards. The result is a normal dashboard the user can edit freely afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {type: 'string'},
        deviceIds: {type: 'array', items: {type: 'string'}},
        keys: {type: 'array', items: {type: 'string'},
          description: 'Telemetry keys to chart, e.g. ["temperature","humidity"]'},
        includeLatestValues: {type: 'boolean', description: 'Add a latest-values card (default true)'}
      },
      required: ['title', 'deviceIds', 'keys']
    },
    handler: async (client, args) => {
      const dashboard = buildDashboard(args);
      return client.post('/api/dashboard', dashboard);
    }
  },
  {
    name: 'assign_dashboard_to_customer',
    write: true,
    description:
      'Give a customer access to a dashboard. This is how a customer user gets a dashboard ' +
      'in their menu.',
    inputSchema: {
      type: 'object',
      properties: {dashboardId: {type: 'string'}, customerId: {type: 'string'}},
      required: ['dashboardId', 'customerId']
    },
    handler: async (client, args) => client.post(
      `/api/customer/${args.customerId}/dashboard/${args.dashboardId}`)
  },
  {
    name: 'add_entities_to_group',
    write: true,
    description:
      'Add entities to an entity group. A GROUP role granted over that group then reaches ' +
      'exactly these entities — this is how row-level access is shaped.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {type: 'string'},
        entityType: {type: 'string', description: 'DEVICE, ASSET, DASHBOARD, USER…'},
        entityIds: {type: 'array', items: {type: 'string'}}
      },
      required: ['groupId', 'entityType', 'entityIds']
    },
    handler: async (client, args) => {
      const added = [];
      const failed = [];
      for (const entityId of args.entityIds) {
        try {
          await client.post(`/api/entityGroup/${args.groupId}/${args.entityType}/${entityId}`);
          added.push(entityId);
        } catch (error) {
          failed.push({entityId, reason: error.message});
        }
      }
      return {added: added.length, failed};
    }
  },
  {
    name: 'grant_role_to_group',
    write: true,
    description:
      'Bind a user group to a role. Omit targetGroupId for a GENERIC role; supply it for a ' +
      'GROUP role, which then applies only to that group\'s entities.',
    inputSchema: {
      type: 'object',
      properties: {
        userGroupId: {type: 'string'},
        roleId: {type: 'string'},
        targetGroupId: {type: 'string', description: 'Required for a GROUP role'},
        targetGroupType: {type: 'string', description: 'Entity type of the target group'}
      },
      required: ['userGroupId', 'roleId']
    },
    handler: async (client, args) => client.post('/api/groupPermission', {
      userGroupId: {entityType: 'ENTITY_GROUP', id: args.userGroupId},
      roleId: {entityType: 'ROLE', id: args.roleId},
      entityGroupId: args.targetGroupId
        ? {entityType: 'ENTITY_GROUP', id: args.targetGroupId} : null,
      entityGroupType: args.targetGroupId ? (args.targetGroupType || 'DEVICE') : null
    })
  },
  {
    name: 'create_customer',
    write: true,
    description: 'Create a customer, the tenant-level grouping that owns devices and users.',
    inputSchema: {
      type: 'object',
      properties: {title: {type: 'string'}, email: {type: 'string'}},
      required: ['title']
    },
    handler: async (client, args) => client.post('/api/customer', {
      title: args.title, email: args.email
    })
  },
  {
    name: 'create_user',
    write: true,
    description:
      'Create a user and return their activation link. Optionally place them in a user ' +
      'group, which is what their permissions are granted through.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {type: 'string'},
        firstName: {type: 'string'},
        lastName: {type: 'string'},
        authority: {type: 'string', description: 'TENANT_ADMIN or CUSTOMER_USER'},
        customerId: {type: 'string', description: 'Required for a CUSTOMER_USER'},
        userGroupId: {type: 'string', description: 'User group to add them to'}
      },
      required: ['email']
    },
    handler: async (client, args) => {
      const user = await client.post('/api/user?sendActivationMail=false', {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        authority: args.authority || 'CUSTOMER_USER',
        customerId: args.customerId ? {entityType: 'CUSTOMER', id: args.customerId} : undefined
      });
      if (args.userGroupId) {
        await client.post(`/api/entityGroup/${args.userGroupId}/USER/${user.id.id}`);
      }
      let activationLink = null;
      try {
        activationLink = await client.get(`/api/user/${user.id.id}/activationLink`);
      } catch {
        // some configurations disable the link; the user still exists and can be activated
        // by mail, so this is not a failure of the call
      }
      return {user: {id: user.id.id, email: user.email, authority: user.authority}, activationLink};
    }
  }
];

/**
 * Builds a dashboard document from a short specification.
 *
 * <p>Produces a plain dashboard — same shape the visual editor writes — so everything about
 * it stays editable afterwards. The point is to skip the tedious first draft, not to own the
 * result.
 */
function buildDashboard({title, deviceIds, keys, includeLatestValues = true}) {
  const widgets = {};
  const layoutWidgets = {};
  let row = 0;

  const datasources = deviceIds.map(id => ({
    type: 'entity',
    entityAliasId: 'devices',
    dataKeys: keys.map((key, index) => ({
      name: key,
      type: 'timeseries',
      label: key,
      color: PALETTE[index % PALETTE.length],
      settings: {},
      _hash: Math.random()
    }))
  }));

  // one chart per key reads better than one chart with every key on it, because the scales
  // are rarely comparable (temperature and humidity on one axis helps nobody)
  keys.forEach((key, index) => {
    const id = `chart-${index}`;
    widgets[id] = {
      typeFullFqn: 'system.charts.basic_timeseries',
      type: 'timeseries',
      title: key,
      sizeX: 12,
      sizeY: 6,
      config: {
        datasources: [{
          type: 'entity',
          entityAliasId: 'devices',
          dataKeys: [{
            name: key, type: 'timeseries', label: key,
            color: PALETTE[index % PALETTE.length], settings: {}, _hash: Math.random()
          }]
        }],
        title: key,
        showTitle: true,
        dropShadow: true,
        enableFullscreen: true,
        settings: {}
      }
    };
    layoutWidgets[id] = {sizeX: 12, sizeY: 6, row: row, col: (index % 2) * 12};
    if (index % 2 === 1) {
      row += 6;
    }
  });
  if (keys.length % 2 === 1) {
    row += 6;
  }

  if (includeLatestValues) {
    const id = 'latest-values';
    widgets[id] = {
      typeFullFqn: 'system.cards.entities_table',
      type: 'latest',
      title: 'Latest values',
      sizeX: 24,
      sizeY: 6,
      config: {
        datasources,
        title: 'Latest values',
        showTitle: true,
        dropShadow: true,
        enableFullscreen: true,
        settings: {}
      }
    };
    layoutWidgets[id] = {sizeX: 24, sizeY: 6, row, col: 0};
  }

  return {
    title,
    configuration: {
      description: 'Created via MCP. Edit freely.',
      widgets,
      states: {
        default: {
          name: title,
          root: true,
          layouts: {main: {widgets: layoutWidgets, gridSettings: {backgroundColor: '#eeeeee'}}}
        }
      },
      entityAliases: {
        devices: {
          id: 'devices',
          alias: 'Devices',
          filter: {
            type: 'entityList',
            entityType: 'DEVICE',
            entityList: deviceIds,
            resolveMultiple: true
          }
        }
      },
      timewindow: {
        realtime: {timewindowMs: 3600000},
        aggregation: {type: 'AVG', limit: 200}
      },
      settings: {stateControllerId: 'entity', showTitle: true, showDashboardsSelect: true}
    }
  };
}

/** Chart colours from the Aetos One palette, so a generated dashboard looks like the product. */
const PALETTE = ['#273A80', '#E6701C', '#2E7D32', '#7B1FA2', '#0288D1', '#C62828'];

module.exports = {TOOLS};
