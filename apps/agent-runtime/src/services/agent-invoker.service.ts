import pm2 from 'pm2';
import { v4 as uuidv4 } from 'uuid';
import { databaseService } from './database.service.js';
import { agentComposerService, type ComposedAgent } from './agent-composer.service.js';
import type { AgentInstanceStatus } from './database.service.js';
import type { StoredAgentInstance } from './database.service.js';

export interface CreateAgentInstanceInput {
  agent_name: string;
  agent_version: string;
  exec_cmd?: string;
  exec_args?: string[];
  env_json?: Record<string, string>;
}

export class AgentInvokerService {
  async createInstance(input: CreateAgentInstanceInput): Promise<StoredAgentInstance> {
    const id = uuidv4();
    const pm2Name = `agent--${input.agent_name.replace(/\//g, '--').replace(/@/g, '-at-')}--${input.agent_version}`;

    // Compose the agent
    const composed = await agentComposerService.compose(input.agent_name, input.agent_version);
    if (!composed) {
      throw new Error(`Failed to compose agent: ${input.agent_name}@${input.agent_version}`);
    }

    const execCmd = input.exec_cmd || 'echo';
    const execArgs = input.exec_args || ['Agent composed successfully'];

    const instance = databaseService.createInstance({
      id,
      agent_name: input.agent_name,
      agent_version: input.agent_version,
      pm2_name: pm2Name,
      exec_cmd: execCmd,
      exec_args: execArgs,
      resolved_skills: JSON.stringify(composed.resolvedSkills.map(s => `${s.name}@${s.version}`)),
      resolved_mcp_instances: JSON.stringify(composed.resolvedMCPServers.map(m => `${m.name}@${m.version}`)),
      composed_prompt: composed.composedPrompt,
    });

    console.log(`[Invoker] Created agent instance: ${id} (${input.agent_name}@${input.agent_version})`);
    return instance;
  }

  async startInstance(id: string): Promise<StoredAgentInstance> {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new Error(`Agent instance not found: ${id}`);
    }

    const args = instance.exec_args ? JSON.parse(instance.exec_args) : [];
    const env = instance.composed_prompt
      ? { AGENT_PROMPT: instance.composed_prompt }
      : undefined;

    return new Promise((resolve, reject) => {
      pm2.connect((connectErr: Error | undefined) => {
        if (connectErr) {
          reject(new Error(`PM2 connect failed: ${connectErr.message}`));
          return;
        }

        pm2.start(
          {
            name: instance.pm2_name,
            script: instance.exec_cmd,
            args: args.length > 0 ? args.join(' ') : '',
            env,
            autorestart: false,
            max_restarts: 3,
          },
          (startErr: Error | undefined) => {
            if (startErr) {
              pm2.disconnect();
              reject(new Error(`PM2 start failed: ${startErr.message}`));
              return;
            }

            databaseService.updateInstanceStatus(id, 'online');
            console.log(`[Invoker] Started agent: ${instance.pm2_name}`);

            pm2.describe(instance.pm2_name, (descErr: Error | undefined, procDescs: pm2.ProcessDescription[] | undefined) => {
              if (!descErr && procDescs && procDescs.length > 0) {
                const proc = procDescs[0];
                databaseService.updateInstanceStatus(id, 'online', {
                  pid: proc.pid,
                  uptime_ms: proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : undefined,
                  restart_count: proc.pm2_env?.restart_time ?? 0,
                });
              }
              pm2.disconnect();
              const updated = databaseService.getInstance(id);
              resolve(updated!);
            });
          }
        );
      });
    });
  }

  async stopInstance(id: string): Promise<StoredAgentInstance> {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new Error(`Agent instance not found: ${id}`);
    }

    databaseService.updateInstanceStatus(id, 'stopping');

    return new Promise((resolve, reject) => {
      pm2.connect((connectErr: Error | undefined) => {
        if (connectErr) {
          reject(new Error(`PM2 connect failed: ${connectErr.message}`));
          return;
        }

        pm2.stop(instance.pm2_name, (stopErr: Error | undefined) => {
          if (stopErr) {
            pm2.disconnect();
            console.warn(`[Invoker] PM2 stop warning: ${stopErr.message}`);
          }

          databaseService.updateInstanceStatus(id, 'stopped');
          pm2.disconnect();
          console.log(`[Invoker] Stopped agent: ${instance.pm2_name}`);

          const updated = databaseService.getInstance(id);
          resolve(updated!);
        });
      });
    });
  }

  async deleteInstance(id: string): Promise<boolean> {
    const instance = databaseService.getInstance(id);
    if (!instance) return false;

    if (instance.status === 'online' || instance.status === 'starting') {
      await this.stopInstance(id).catch(() => {});
    }

    return new Promise((resolve) => {
      pm2.connect((connectErr: Error | undefined) => {
        if (!connectErr) {
          pm2.delete(instance.pm2_name, () => {
            pm2.disconnect();
          });
        }
        resolve(databaseService.deleteInstance(id));
      });
    });
  }

  async invokeAgent(id: string, input: string): Promise<{ instance: StoredAgentInstance; output: string }> {
    const instance = databaseService.getInstance(id);
    if (!instance) {
      throw new Error(`Agent instance not found: ${id}`);
    }

    if (!instance.composed_prompt) {
      throw new Error('Agent has no composed prompt');
    }

    const startTime = Date.now();
    databaseService.recordInvocation({
      instance_id: id,
      input,
      status: 'pending',
    });

    try {
      // For now, the "invocation" returns the composed prompt as the output
      // In production, this would send the prompt + input to a language model or MCP pipeline
      const output = `${instance.composed_prompt}

---
## Invocation Input
${input}
---
`;

      const durationMs = Date.now() - startTime;
      databaseService.recordInvocation({
        instance_id: id,
        input,
        output,
        status: 'success',
        duration_ms: durationMs,
      });

      console.log(`[Invoker] Agent ${instance.agent_name} invoked (${durationMs}ms)`);

      return { instance, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - startTime;

      databaseService.updateInstanceStatus(id, 'errored', { last_error: message });
      databaseService.recordInvocation({
        instance_id: id,
        input,
        status: 'error',
        error: message,
        duration_ms: durationMs,
      });

      throw error;
    }
  }
}

export const agentInvokerService = new AgentInvokerService();
