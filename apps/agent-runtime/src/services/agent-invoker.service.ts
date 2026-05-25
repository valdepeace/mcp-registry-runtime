import { v4 as uuidv4 } from 'uuid';
import { databaseService } from './database.service.js';
import { agentComposerService, AgentLookupError } from './agent-composer.service.js';
import type { MastraAgentResult, AgentSnapshot } from './agent-composer.service.js';
import { createMastraAgentFromSnapshot } from '../mastra/agent-factory.js';
import type { StoredAgentInstance } from './database.service.js';

export interface CreateAgentInstanceInput {
  agent_name: string;
  agent_version: string;
  exec_cmd?: string;
  exec_args?: string[];
  env_json?: Record<string, string>;
  auto_start?: boolean;
}

export interface StreamInvokeEventHandlers {
  onTextDelta: (chunk: string) => void | Promise<void>;
}

interface AgentCacheEntry {
  mastraResult: MastraAgentResult;
  instance: StoredAgentInstance;
}

export class AgentRuntimeError extends Error {
  constructor(
    public readonly code: 'not_found' | 'invalid_state' | 'composition_failed' | 'invoke_failed',
    message: string
  ) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

export class AgentInvokerService {
  private agentCache = new Map<string, AgentCacheEntry>();

  async createInstance(input: CreateAgentInstanceInput): Promise<StoredAgentInstance> {
    const id = uuidv4();

    let snapshot: AgentSnapshot;
    try {
      snapshot = await agentComposerService.resolveSnapshot(input.agent_name, input.agent_version);
    } catch (error) {
      if (error instanceof AgentLookupError) {
        const runtimeCode = error.code === 'not_found' ? 'not_found' : 'composition_failed';
        throw new AgentRuntimeError(runtimeCode, error.message);
      }
      const message = error instanceof Error ? error.message : `Failed to resolve agent: ${input.agent_name}@${input.agent_version}`;
      throw new AgentRuntimeError('composition_failed', message);
    }

    databaseService.createInstance({
      id,
      agent_name: input.agent_name,
      agent_version: input.agent_version,
      pm2_name: null,
      exec_cmd: input.exec_cmd || '',
      exec_args: input.exec_args ?? [],
      env_json: input.env_json,
      agent_snapshot_json: JSON.stringify(snapshot),
    });

    console.log(`[Invoker] Created agent instance: ${id} (${input.agent_name}@${input.agent_version}, ${snapshot.skills.length} skills, ${snapshot.mcpServers.length} MCP servers)`);

    if (input.auto_start) {
      return this.startInstance(id);
    }

    return databaseService.getInstance(id)!;
  }

  async startInstance(id: string): Promise<StoredAgentInstance> {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new AgentRuntimeError('not_found', `Agent instance not found: ${id}`);
    }

    if (this.agentCache.has(id)) {
      databaseService.updateInstanceStatus(id, 'online', { last_started_at: new Date().toISOString() });
      const refreshed = databaseService.getInstance(id)!;
      this.agentCache.set(id, { ...this.agentCache.get(id)!, instance: refreshed });
      return refreshed;
    }

    if (!instance.agent_snapshot_json) {
      const message = `No snapshot found for instance ${id}; delete and recreate the instance to fetch a fresh snapshot`;
      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      throw new AgentRuntimeError('composition_failed', message);
    }

    databaseService.updateInstanceStatus(id, 'starting');

    let snapshot: AgentSnapshot;
    try {
      snapshot = JSON.parse(instance.agent_snapshot_json) as AgentSnapshot;
    } catch {
      const message = `Corrupt snapshot for instance ${id}; delete and recreate the instance`;
      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      throw new AgentRuntimeError('composition_failed', message);
    }

    let mastraResult: MastraAgentResult | null;
    try {
      mastraResult = await createMastraAgentFromSnapshot(snapshot, parseEnvJson(instance.env_json));
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to build agent: ${instance.agent_name}@${instance.agent_version}`;
      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      throw new AgentRuntimeError('composition_failed', message);
    }

    if (!mastraResult) {
      const message = `Failed to build agent: ${instance.agent_name}@${instance.agent_version}`;
      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      throw new AgentRuntimeError('composition_failed', message);
    }

    databaseService.updateInstance(id, {
      resolved_skills: JSON.stringify(mastraResult.resolvedSkills.map(s => `${s.name}@${s.version}`)),
      resolved_mcp_instances: JSON.stringify(mastraResult.resolvedMCPServers.map(m => `${m.name}@${m.version}`)),
      composed_prompt: mastraResult.instructions,
    });
    databaseService.updateInstanceStatus(id, 'online', {
      last_started_at: new Date().toISOString(),
      last_composed_at: new Date().toISOString(),
    });

    const refreshed = databaseService.getInstance(id)!;
    const entry: AgentCacheEntry = { mastraResult, instance: refreshed };
    this.agentCache.set(id, entry);

    console.log(`[Invoker] Started agent: ${instance.agent_name}`);
    return refreshed;
  }

  async stopInstance(id: string): Promise<StoredAgentInstance> {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new AgentRuntimeError('not_found', `Agent instance not found: ${id}`);
    }

    databaseService.updateInstanceStatus(id, 'stopping');

    const cached = this.agentCache.get(id);
    if (cached) {
      try {
        await cached.mastraResult.mcpClient.disconnect();
      } catch (err) {
        console.warn('[Invoker] Error disconnecting MCP client:', err);
      }
      this.agentCache.delete(id);
    }

    databaseService.updateInstanceStatus(id, 'stopped', { last_stopped_at: new Date().toISOString() });
    console.log(`[Invoker] Stopped agent: ${instance.agent_name}`);

    return databaseService.getInstance(id)!;
  }

  async deleteInstance(id: string): Promise<boolean> {
    const instance = databaseService.getInstance(id);
    if (!instance) return false;

    if (instance.status === 'online' || instance.status === 'starting') {
      await this.stopInstance(id).catch(() => {});
    }

    const cached = this.agentCache.get(id);
    if (cached) {
      try {
        await cached.mastraResult.mcpClient.disconnect();
      } catch { /* ignore */ }
      this.agentCache.delete(id);
    }

    return databaseService.deleteInstance(id);
  }

  async invokeAgent(id: string, input: string): Promise<{ instance: StoredAgentInstance; output: string }> {
    const { cached, instance } = this.getCachedOnlineAgent(id);

    const startTime = Date.now();
    const invocationId = databaseService.recordInvocation({
      instance_id: id,
      input,
      status: 'pending',
    });

    try {
      const response = await cached.mastraResult.agent.generate(input);
      const output = typeof response === 'object' && response !== null && 'text' in response
        ? (response as { text: string }).text
        : JSON.stringify(response);

      const durationMs = Date.now() - startTime;
      databaseService.updateInvocation(invocationId, {
        output,
        status: 'success',
        duration_ms: durationMs,
      });
      databaseService.updateInstanceStatus(id, 'online', { last_invoked_at: new Date().toISOString() });

      console.log(`[Invoker] Agent ${instance.agent_name} invoked (${durationMs}ms)`);

      return { instance: databaseService.getInstance(id)!, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - startTime;

      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      databaseService.updateInvocation(invocationId, {
        status: 'error',
        error: message,
        duration_ms: durationMs,
      });

      throw error;
    }
  }

  async invokeAgentStream(
    id: string,
    input: string,
    handlers: StreamInvokeEventHandlers
  ): Promise<{ instance: StoredAgentInstance; output: string }> {
    const { cached, instance } = this.getCachedOnlineAgent(id);

    const startTime = Date.now();
    const invocationId = databaseService.recordInvocation({
      instance_id: id,
      input,
      status: 'pending',
    });

    let fullOutput = '';

    try {
      const stream = await cached.mastraResult.agent.stream(input);

      for await (const chunk of stream.textStream) {
        fullOutput += chunk;
        await handlers.onTextDelta(chunk);
      }

      const durationMs = Date.now() - startTime;
      databaseService.updateInvocation(invocationId, {
        output: fullOutput,
        status: 'success',
        duration_ms: durationMs,
      });
      databaseService.updateInstanceStatus(id, 'online', { last_invoked_at: new Date().toISOString() });

      console.log(`[Invoker] Agent ${instance.agent_name} stream invoked (${durationMs}ms)`);

      return { instance: databaseService.getInstance(id)!, output: fullOutput };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - startTime;

      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      databaseService.updateInvocation(invocationId, {
        status: 'error',
        error: message,
        duration_ms: durationMs,
      });

      throw error;
    }
  }

  getCachedOnlineAgent(id: string): { cached: AgentCacheEntry; instance: StoredAgentInstance } {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new AgentRuntimeError('not_found', `Agent instance not found: ${id}`);
    }

    if (instance.status !== 'online') {
      throw new AgentRuntimeError('invalid_state', `Agent instance ${id} is ${instance.status}; start it before invoking`);
    }

    const cached = this.agentCache.get(id);
    if (!cached) {
      databaseService.updateInstanceStatus(id, 'errored', {
        last_error: 'Agent cache is empty; start the instance again',
      });
      throw new AgentRuntimeError('invalid_state', `Agent instance ${id} is not loaded in memory; start it again`);
    }

    return { cached, instance };
  }
}

function parseEnvJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

export const agentInvokerService = new AgentInvokerService();
