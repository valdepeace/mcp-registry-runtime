import type { AgentDetail, AgentResponse, SkillResponse } from '@mcp-nova/types';
import { config } from '../config/index.js';

interface ResolvedSkill {
  name: string;
  version: string;
  content: string;
  format: string;
}

interface ResolvedMCPServer {
  name: string;
  version: string;
  instanceId?: string;
  tools?: string[];
}

export interface ComposedAgent {
  agent: AgentDetail;
  resolvedSkills: ResolvedSkill[];
  resolvedMCPServers: ResolvedMCPServer[];
  composedPrompt: string;
}

export class AgentComposerService {
  private registryUrl: string;
  private runtimeUrl: string;

  constructor() {
    this.registryUrl = config.registryUrl;
    this.runtimeUrl = config.runtimeUrl;
  }

  async fetchAgent(name: string, version: string): Promise<AgentResponse | null> {
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const url = new URL(`/v0.1/agents/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      console.error(`[Composer] Failed to fetch agent ${name}@${version}: ${response.status}`);
      return null;
    }

    return response.json() as Promise<AgentResponse>;
  }

  async fetchSkill(name: string, version: string): Promise<SkillResponse | null> {
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const url = new URL(`/v0.1/skills/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      console.error(`[Composer] Failed to fetch skill ${name}@${version}: ${response.status}`);
      return null;
    }

    return response.json() as Promise<SkillResponse>;
  }

  async resolveSkills(skillRefs: { name: string; version: string }[]): Promise<ResolvedSkill[]> {
    const resolved: ResolvedSkill[] = [];

    for (const ref of skillRefs) {
      const skillResponse = await this.fetchSkill(ref.name, ref.version);
      if (skillResponse) {
        resolved.push({
          name: ref.name,
          version: ref.version,
          content: skillResponse.skill.content,
          format: skillResponse.skill.format,
        });
      } else {
        console.warn(`[Composer] Skill not found: ${ref.name}@${ref.version}`);
      }
    }

    return resolved;
  }

  async resolveMCPServers(mcpRefs: { name: string; version: string }[]): Promise<ResolvedMCPServer[]> {
    const resolved: ResolvedMCPServer[] = [];

    for (const ref of mcpRefs) {
      // Resolve MCP server via runtime
      const encodedName = encodeURIComponent(ref.name);
      const encodedVersion = encodeURIComponent(ref.version);
      const url = new URL(`/v0.1/servers/${encodedName}/versions/${encodedVersion}`, this.registryUrl);

      try {
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          console.warn(`[Composer] MCP server not found in registry: ${ref.name}@${ref.version}`);
          resolved.push({ name: ref.name, version: ref.version });
          continue;
        }

        const serverResponse = await response.json() as { server: { packages?: { transport?: { type: string } }[] } };
        const tools: string[] = [];

        // If the server has a stdio transport package, we could inspect tools via runtime
        // For now, just record the reference
        resolved.push({
          name: ref.name,
          version: ref.version,
          tools,
        });
      } catch (err) {
        console.warn(`[Composer] Error resolving MCP server ${ref.name}@${ref.version}:`, err);
        resolved.push({ name: ref.name, version: ref.version });
      }
    }

    return resolved;
  }

  async compose(agentName: string, agentVersion: string): Promise<ComposedAgent | null> {
    console.log(`[Composer] Composing agent: ${agentName}@${agentVersion}`);

    const agentResponse = await this.fetchAgent(agentName, agentVersion);
    if (!agentResponse) {
      console.error(`[Composer] Agent not found: ${agentName}@${agentVersion}`);
      return null;
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

  private assemblePrompt(
    agent: AgentDetail,
    skills: ResolvedSkill[],
    mcpServers: ResolvedMCPServer[]
  ): string {
    const parts: string[] = [];

    // 1. Agent instructions (system prompt)
    parts.push(`# Agent: ${agent.name}`);
    parts.push('');
    parts.push(agent.instructions);
    parts.push('');

    // 2. Skills content
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

    // 3. Available MCP tools
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

    // 4. Tool access
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
