import type { AgentDetail, AgentResponse } from '@mcp-nova/types';
import { config } from '../config/index.js';
import type { ResolvedSkill, ResolvedMCPServer, AgentSnapshot } from '../mastra/agent-factory.js';
import { createMastraAgent, resolveAgentSnapshot, type MastraAgentResult } from '../mastra/agent-factory.js';

export type { ResolvedSkill, ResolvedMCPServer, MastraAgentResult, AgentSnapshot };

export class AgentLookupError extends Error {
  constructor(
    public readonly code: 'not_found' | 'fetch_failed',
    message: string
  ) {
    super(message);
    this.name = 'AgentLookupError';
  }
}

export interface ComposedAgent {
  agent: AgentDetail;
  resolvedSkills: ResolvedSkill[];
  resolvedMCPServers: ResolvedMCPServer[];
  composedPrompt: string;
}

export class AgentComposerService {
  private registryUrl: string;

  constructor() {
    this.registryUrl = config.registryUrl;
  }

  async resolveAgent(name: string, version: string): Promise<AgentResponse> {
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const url = new URL(`/v0.1/agents/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

    let response: globalThis.Response;
    try {
      response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });
    } catch (err) {
      throw new AgentLookupError(
        'fetch_failed',
        `Cannot reach registry at ${this.registryUrl}: ${err instanceof Error ? err.message : 'network error'}`
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new AgentLookupError('not_found', `Agent ${name}@${version} was not found in the registry`);
      }

      throw new AgentLookupError(
        'fetch_failed',
        `Failed to fetch agent ${name}@${version} from registry (${response.status})`
      );
    }

    return response.json() as Promise<AgentResponse>;
  }

  async compose(agentName: string, agentVersion: string): Promise<ComposedAgent | null> {
    console.log(`[Composer] Composing agent: ${agentName}@${agentVersion}`);

    let agentResponse: AgentResponse;
    try {
      agentResponse = await this.resolveAgent(agentName, agentVersion);
    } catch (error) {
      if (error instanceof AgentLookupError) {
        console.error(`[Composer] ${error.message}`);
        return null;
      }
      throw error;
    }

    const agent = agentResponse.agent;

    console.log(`[Composer] Resolving ${agent.required_skills?.length ?? 0} skills, ${agent.required_mcp_servers?.length ?? 0} MCP servers`);

    const [resolvedSkills, resolvedMCPServers] = await Promise.all([
      this.resolveSkills(agent.required_skills ?? []),
      this.resolveMCPServers(agent.required_mcp_servers ?? []),
    ]);

    const composedPrompt = this.assemblePrompt(agent, resolvedSkills, resolvedMCPServers);

    console.log(`[Composer] Agent composed: ${resolvedSkills.length} skills, ${resolvedMCPServers.length} MCP servers`);

    return {
      agent,
      resolvedSkills,
      resolvedMCPServers,
      composedPrompt,
    };
  }

  async composeMastra(
    agentName: string,
    agentVersion: string,
    envOverrides: Record<string, string> = {}
  ): Promise<MastraAgentResult | null> {
    console.log(`[Composer] Composing Mastra agent: ${agentName}@${agentVersion}`);

    const agentResponse = await this.resolveAgent(agentName, agentVersion);
    return createMastraAgent(agentResponse.agent, envOverrides);
  }

  /**
   * Fetches the agent definition plus all its skill/MCP dependencies from the registry
   * and returns a serializable snapshot. Store this at instance-creation time so that
   * subsequent starts do not need the registry to be reachable.
   */
  async resolveSnapshot(agentName: string, agentVersion: string): Promise<AgentSnapshot> {
    const agentResponse = await this.resolveAgent(agentName, agentVersion);
    return resolveAgentSnapshot(agentResponse.agent);
  }

  private async resolveSkills(skillRefs: { name: string; version: string }[]): Promise<ResolvedSkill[]> {
    const resolved: ResolvedSkill[] = [];

    for (const ref of skillRefs) {
      const encodedName = encodeURIComponent(ref.name);
      const encodedVersion = encodeURIComponent(ref.version);
      const url = new URL(`/v0.1/skills/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

      try {
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          console.warn(`[Composer] Skill not found: ${ref.name}@${ref.version}`);
          continue;
        }

        const skillResponse = await response.json() as { skill: { content: string; format: string } };
        resolved.push({
          name: ref.name,
          version: ref.version,
          content: skillResponse.skill.content,
          format: skillResponse.skill.format,
        });
      } catch (err) {
        console.warn(`[Composer] Error resolving skill ${ref.name}@${ref.version}:`, err);
      }
    }

    return resolved;
  }

  private async resolveMCPServers(mcpRefs: { name: string; version: string }[]): Promise<ResolvedMCPServer[]> {
    const resolved: ResolvedMCPServer[] = [];

    for (const ref of mcpRefs) {
      const encodedName = encodeURIComponent(ref.name);
      const encodedVersion = encodeURIComponent(ref.version);
      const url = new URL(`/v0.1/servers/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

      try {
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          console.warn(`[Composer] MCP server not found in registry: ${ref.name}@${ref.version}`);
          resolved.push({ name: ref.name, version: ref.version, mcpClientConfig: null });
          continue;
        }

        await response.json();

        resolved.push({
          name: ref.name,
          version: ref.version,
          mcpClientConfig: null,
          tools: [],
        });
      } catch (err) {
        console.warn(`[Composer] Error resolving MCP server ${ref.name}@${ref.version}:`, err);
        resolved.push({ name: ref.name, version: ref.version, mcpClientConfig: null });
      }
    }

    return resolved;
  }

  private assemblePrompt(
    agent: AgentDetail,
    skills: ResolvedSkill[],
    mcpServers: ResolvedMCPServer[]
  ): string {
    const parts: string[] = [];

    parts.push(`# Agent: ${agent.name}`);
    parts.push('');
    parts.push(agent.instructions);
    parts.push('');

    if (skills.length > 0) {
      parts.push('## Loaded Skills');
      parts.push('');
      for (const skill of skills) {
        parts.push(`### Skill: ${skill.name} (v${skill.version})`);
        parts.push('');
        parts.push(skill.content);
        parts.push('');
      }
    }

    if (mcpServers.length > 0) {
      parts.push('## Available MCP Servers');
      parts.push('');
      for (const mcp of mcpServers) {
        parts.push(`- **${mcp.name}** v${mcp.version}`);
        if (mcp.tools && mcp.tools.length > 0) {
          parts.push(`  Tools: ${mcp.tools.join(', ')}`);
        }
      }
      parts.push('');
    }

    if (agent.tool_access && agent.tool_access.length > 0) {
      parts.push('## Authorized Tools');
      parts.push('');
      parts.push(`- ${agent.tool_access.join('\n- ')}`);
      parts.push('');
    }

    return parts.join('\n');
  }
}

export const agentComposerService = new AgentComposerService();
