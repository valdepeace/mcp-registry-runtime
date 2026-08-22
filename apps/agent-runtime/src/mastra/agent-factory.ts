import { Agent } from '@mastra/core/agent';
import { MCPClient } from '@mastra/mcp';
import type { MastraMCPServerDefinition } from '@mastra/mcp';
import type { AgentDetail, SkillResponse, ServerResponse, Package, KeyValueInput } from '@mcp/types';
import { config } from '../config/index.js';

export interface ResolvedSkill {
  name: string;
  version: string;
  content: string;
  format: string;
}

export interface ResolvedMCPServer {
  name: string;
  version: string;
  mcpClientConfig: MastraMCPServerDefinition | null;
  tools?: string[];
}

export interface MastraAgentResult {
  agent: Agent;
  mcpClient: MCPClient;
  resolvedSkills: ResolvedSkill[];
  resolvedMCPServers: ResolvedMCPServer[];
  instructions: string;
  toolNames: string[];
  permittedToolNames: string[];
}

export interface AgentSnapshot {
  agentDetail: AgentDetail;
  skills: ResolvedSkill[];
  mcpServers: Array<{ name: string; version: string; serverData: ServerResponse | null }>;
}

async function fetchSkill(name: string, version: string): Promise<SkillResponse | null> {
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const url = new URL(`/v0.1/skills/${encodedName}/versions/${encodedVersion}`, config.registryUrl);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error(`[AgentFactory] Failed to fetch skill ${name}@${version}: ${response.status}`);
    return null;
  }

  return response.json() as Promise<SkillResponse>;
}

async function fetchMCPDetail(name: string, version: string): Promise<ServerResponse | null> {
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const url = new URL(`/v0.1/servers/${encodedName}/versions/${encodedVersion}`, config.registryUrl);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error(`[AgentFactory] Failed to fetch MCP server ${name}@${version}: ${response.status}`);
    return null;
  }

  return response.json() as Promise<ServerResponse>;
}

function getEnvValue(ev: KeyValueInput, envOverrides: Record<string, string>): string {
  return envOverrides[ev.name] ?? ev.value ?? '';
}

function buildStdioConfig(pkg: Package, envOverrides: Record<string, string>): MastraMCPServerDefinition {
  const command = pkg.runtimeHint || 'npx';
  const args: string[] = command === 'npx' || command === 'uvx' || command === 'bunx'
    ? ['-y', pkg.identifier]
    : [pkg.identifier];

  if (pkg.packageArguments) {
    for (const arg of pkg.packageArguments) {
      const val = arg.value as string | undefined;
      if (val) args.push(val);
      if (arg.name && val) args.push(arg.name, val);
    }
  }

  const env: Record<string, string> = {};
  if (pkg.environmentVariables) {
    for (const ev of pkg.environmentVariables) {
      env[ev.name] = getEnvValue(ev, envOverrides);
    }
  }

  return { command, args, env: { ...env, ...envOverrides } };
}

function shortToolName(toolName: string): string {
  return toolName.split(/[.:/]/).pop()?.split('__').pop() ?? toolName;
}

function toolMatchesAccess(toolName: string, allowedName: string): boolean {
  return toolName === allowedName || shortToolName(toolName) === allowedName;
}

function filterToolsByAccess(
  tools: Record<string, unknown>,
  toolAccess: string[] | undefined
): { filteredTools: Record<string, unknown>; permittedToolNames: string[] } {
  const requestedTools = (toolAccess ?? []).map((tool) => tool.trim()).filter(Boolean);
  if (requestedTools.length === 0) {
    return { filteredTools: {}, permittedToolNames: [] };
  }

  const entries = Object.entries(tools);
  const matched = new Map<string, unknown>();
  const missing: string[] = [];

  for (const allowedName of requestedTools) {
    const matches = entries.filter(([toolName]) => toolMatchesAccess(toolName, allowedName));
    if (matches.length === 0) {
      missing.push(allowedName);
      continue;
    }

    for (const [toolName, tool] of matches) {
      matched.set(toolName, tool);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Authorized tool(s) not available: ${missing.join(', ')}`);
  }

  return {
    filteredTools: Object.fromEntries(matched),
    permittedToolNames: Array.from(matched.keys()),
  };
}

async function buildMastraAgentFromResolvedData(
  agent: AgentDetail,
  skills: ResolvedSkill[],
  mcpServerEntries: Array<{ name: string; version: string; serverData: ServerResponse | null }>,
  envOverrides: Record<string, string>
): Promise<MastraAgentResult | null> {
  const resolvedMCPServers: ResolvedMCPServer[] = [];
  const mcpServerConfigs: Record<string, MastraMCPServerDefinition> = {};

  for (const entry of mcpServerEntries) {
    if (!entry.serverData) {
      resolvedMCPServers.push({ name: entry.name, version: entry.version, mcpClientConfig: null });
      continue;
    }

    const server = entry.serverData.server;
    const primaryPackage = server.packages?.[0];
    let mcpClientConfig: MastraMCPServerDefinition | null = null;

    if (primaryPackage) {
      const transport = primaryPackage.transport;
      if (transport.type === 'streamable-http' || transport.type === 'sse') {
        const httpConfig: MastraMCPServerDefinition = { url: new URL(transport.url) };
        if (transport.headers && transport.headers.length > 0) {
          const headers: Record<string, string> = {};
          for (const h of transport.headers) {
            const value = h.value ?? envOverrides[h.name];
            if (value) headers[h.name] = value;
          }
          httpConfig.requestInit = { headers };
        }
        mcpClientConfig = httpConfig;
      } else {
        mcpClientConfig = buildStdioConfig(primaryPackage, envOverrides);
      }
    }

    if (mcpClientConfig) {
      const sanitizedName = entry.name.replace(/[/@]/g, '_');
      mcpServerConfigs[sanitizedName] = mcpClientConfig;
    }

    resolvedMCPServers.push({ name: entry.name, version: entry.version, mcpClientConfig });
  }

  const mcpClientId = `agent--${agent.name.replace(/[/@]/g, '_')}--${agent.version}`;
  const mcpClient = new MCPClient({
    id: mcpClientId,
    servers: mcpServerConfigs,
    timeout: 30000,
  });

  let tools: Record<string, unknown> = {};
  if (Object.keys(mcpServerConfigs).length > 0) {
    try {
      tools = await mcpClient.listTools();
      console.log(`[AgentFactory] Loaded ${Object.keys(tools).length} MCP tools`);
    } catch (err) {
      console.warn('[AgentFactory] Failed to load MCP tools:', err);
    }
  }

  const toolNames = Object.keys(tools);
  const { filteredTools, permittedToolNames } = filterToolsByAccess(tools, agent.tool_access);

  const skillContent = skills
    .map((s) => `### Skill: ${s.name} (v${s.version})\n\n${s.content}`)
    .join('\n\n');

  const toolAccessInfo = agent.tool_access?.length
    ? `\n\n## Authorized Tools\n${permittedToolNames.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  const mcpServerInfo = resolvedMCPServers.length
    ? `\n\n## Available MCP Servers\n${resolvedMCPServers.map((s) => `- ${s.name} v${s.version}`).join('\n')}\n`
    : '';

  const instructions = `${agent.instructions}${mcpServerInfo}${toolAccessInfo}${skillContent ? '\n\n## Skills\n' + skillContent : ''}`;

  const mastraAgent = new Agent({
    id: mcpClientId,
    name: agent.title || agent.name,
    instructions,
    model: config.mastraModel as string,
    tools: filteredTools as Record<string, any>,
  });

  console.log(`[AgentFactory] Agent created: ${agent.name}@${agent.version} (${skills.length} skills, ${permittedToolNames.length}/${toolNames.length} tools permitted)`);

  return {
    agent: mastraAgent,
    mcpClient,
    resolvedSkills: skills,
    resolvedMCPServers,
    instructions,
    toolNames,
    permittedToolNames,
  };
}

/**
 * Fetches all dependencies (skills + MCP server details) for an agent from the registry
 * and returns a serializable snapshot. Call this at instance-creation time so start
 * can proceed without the registry being available.
 */
export async function resolveAgentSnapshot(agent: AgentDetail): Promise<AgentSnapshot> {
  const skills: ResolvedSkill[] = [];
  const mcpServers: AgentSnapshot['mcpServers'] = [];

  for (const ref of agent.required_skills ?? []) {
    try {
      const skillResponse = await fetchSkill(ref.name, ref.version);
      if (skillResponse) {
        skills.push({
          name: ref.name,
          version: ref.version,
          content: skillResponse.skill.content,
          format: skillResponse.skill.format,
        });
      } else {
        console.warn(`[AgentFactory] Skill not found during snapshot: ${ref.name}@${ref.version}`);
      }
    } catch (err) {
      console.warn(`[AgentFactory] Error fetching skill ${ref.name}@${ref.version}:`, err);
    }
  }

  for (const ref of agent.required_mcp_servers ?? []) {
    try {
      const serverData = await fetchMCPDetail(ref.name, ref.version);
      if (!serverData) {
        console.warn(`[AgentFactory] MCP server not found during snapshot: ${ref.name}@${ref.version}`);
      }
      mcpServers.push({ name: ref.name, version: ref.version, serverData });
    } catch (err) {
      console.warn(`[AgentFactory] Error fetching MCP server ${ref.name}@${ref.version}:`, err);
      mcpServers.push({ name: ref.name, version: ref.version, serverData: null });
    }
  }

  return { agentDetail: agent, skills, mcpServers };
}

/**
 * Creates a Mastra agent from a pre-fetched snapshot stored at instance-creation time.
 * No registry calls — safe to call when registry is offline.
 */
export async function createMastraAgentFromSnapshot(
  snapshot: AgentSnapshot,
  envOverrides: Record<string, string> = {}
): Promise<MastraAgentResult | null> {
  console.log(`[AgentFactory] Creating Mastra agent from snapshot: ${snapshot.agentDetail.name}@${snapshot.agentDetail.version}`);
  return buildMastraAgentFromResolvedData(
    snapshot.agentDetail,
    snapshot.skills,
    snapshot.mcpServers,
    envOverrides
  );
}

/**
 * Creates a Mastra agent by fetching all dependencies from the registry.
 * Requires the registry to be available.
 */
export async function createMastraAgent(
  agent: AgentDetail,
  envOverrides: Record<string, string> = {}
): Promise<MastraAgentResult | null> {
  console.log(`[AgentFactory] Creating Mastra agent: ${agent.name}@${agent.version}`);

  const skills: ResolvedSkill[] = [];
  const mcpServerEntries: AgentSnapshot['mcpServers'] = [];

  for (const ref of agent.required_skills ?? []) {
    const skillResponse = await fetchSkill(ref.name, ref.version);
    if (skillResponse) {
      skills.push({
        name: ref.name,
        version: ref.version,
        content: skillResponse.skill.content,
        format: skillResponse.skill.format,
      });
    } else {
      console.warn(`[AgentFactory] Skill not found: ${ref.name}@${ref.version}`);
    }
  }

  for (const ref of agent.required_mcp_servers ?? []) {
    const serverData = await fetchMCPDetail(ref.name, ref.version);
    if (!serverData) {
      console.warn(`[AgentFactory] MCP server not found: ${ref.name}@${ref.version}`);
    }
    mcpServerEntries.push({ name: ref.name, version: ref.version, serverData });
  }

  return buildMastraAgentFromResolvedData(agent, skills, mcpServerEntries, envOverrides);
}
