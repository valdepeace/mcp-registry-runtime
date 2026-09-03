import { registryClient } from './registry-client.service.js';
import { runtimeClient, type RuntimeInstance } from './runtime-client.service.js';

/**
 * The four skills advertised in the Agent Card, each a thin translation onto
 * apps/registry / apps/runtime's existing APIs — no business logic lives
 * here that isn't already there. See the design doc (memory: a2a-gateway-design).
 */

export interface SkillResult {
  /** Mirrors an A2A Task's terminal/intermediate states. */
  status: 'completed' | 'failed' | 'input-required';
  data?: unknown;
  error?: string;
}

export async function listCatalog(input: { query?: string }): Promise<SkillResult> {
  const { servers } = await registryClient.search(input.query ?? '', 20);
  return {
    status: 'completed',
    data: servers.map(s => ({
      name: s.server.name,
      title: s.server.title,
      description: s.server.description,
      version: s.server.version,
    })),
  };
}

export async function listRunning(): Promise<SkillResult> {
  const { instances } = await runtimeClient.listInstances();
  return {
    status: 'completed',
    data: instances.map(i => ({
      id: i.id,
      server_name: i.server_name,
      version: i.version,
      status: i.status,
      endpoint_url: i.endpoint_url,
    })),
  };
}

export async function getStatus(input: { instance_id?: string }): Promise<SkillResult> {
  if (!input.instance_id) {
    return { status: 'failed', error: 'instance_id is required' };
  }
  try {
    const { instance } = await runtimeClient.getInstance(input.instance_id);
    return { status: 'completed', data: instance };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : 'Instance not found' };
  }
}

/**
 * Decision (design doc): ambiguous requests return the candidate list rather
 * than guessing, and every caller asking for the same server_name+version is
 * routed to the one shared instance rather than getting their own.
 */
export async function requestMcp(input: {
  server_name?: string;
  query?: string;
  version?: string;
  auto_start?: boolean;
}): Promise<SkillResult> {
  let serverName = input.server_name;

  if (!serverName) {
    if (!input.query) {
      return { status: 'failed', error: 'Provide either server_name or query' };
    }
    const { servers } = await registryClient.search(input.query, 10);
    if (servers.length === 0) {
      return { status: 'failed', error: `No catalog entry matches "${input.query}"` };
    }
    if (servers.length > 1) {
      return {
        status: 'input-required',
        data: {
          message: 'Multiple servers match — re-send with an exact server_name.',
          candidates: servers.map(s => ({ name: s.server.name, title: s.server.title, description: s.server.description, version: s.server.version })),
        },
      };
    }
    serverName = servers[0]!.server.name;
  }

  // Shared-instance routing: if this MCP (any version, unless one was asked
  // for specifically) is already running, hand that back instead of a duplicate.
  const { instances } = await runtimeClient.listInstances();
  const existing = instances.find((i: RuntimeInstance) =>
    i.server_name === serverName &&
    (!input.version || i.version === input.version) &&
    i.status !== 'errored'
  );
  if (existing) {
    // "Request" implies usable, not just present — start it if it isn't already.
    if (existing.status === 'stopped' && (input.auto_start ?? true)) {
      try {
        const { instance } = await runtimeClient.startInstance(existing.id);
        return { status: 'completed', data: { reused: true, instance } };
      } catch (err) {
        return { status: 'failed', error: err instanceof Error ? err.message : 'Failed to start the existing instance' };
      }
    }
    return { status: 'completed', data: { reused: true, instance: existing } };
  }

  try {
    const { instance, message } = await runtimeClient.createFromCatalog(serverName, input.version, input.auto_start ?? true);
    return { status: 'completed', data: { reused: false, instance, message } };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : 'Failed to provision' };
  }
}

export const skills = {
  list_catalog: listCatalog,
  list_running: listRunning,
  get_status: getStatus,
  request_mcp: requestMcp,
} as const;

export type SkillName = keyof typeof skills;
