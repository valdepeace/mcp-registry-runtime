import type {
  ServerListResponse,
  ServerResponse,
  ListServersParams,
  RegistryStats,
  LoginResponse,
  User,
  ServerDetail,
  RuntimeListResponse,
  RuntimeMetricsResponse,
  RuntimeInstanceResponse,
  RuntimeLogsResponse,
  CreateRuntimeInstanceInput,
  UpdateRuntimeInstanceInput,
  McpCapabilities,
  McpToolResult,
  McpResourceContents,
  McpPromptResult,
  InspectHistoryEntry,
  SkillListResponse,
  SkillResponse,
  SkillListParams,
  AgentListResponse,
  AgentResponse,
  AgentListParams,
  AgentInstanceListResponse,
  AgentInstanceResponse,
  AgentComposeResponse,
  AgentInvokeResponse,
  AgentInvocation,
  SkillDetail,
  AgentDetail,
} from '$lib/types';

const API_BASE = '';

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Merge any additional headers from options
    if (options.headers) {
      const additionalHeaders = options.headers;
      if (Array.isArray(additionalHeaders)) {
        for (const [key, value] of additionalHeaders) {
          headers[key] = value;
        }
      } else if (additionalHeaders instanceof Headers) {
        additionalHeaders.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, additionalHeaders);
      }
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw err;
    }
  }

  // Public API

  async listServers(params: ListServersParams = {}): Promise<ServerListResponse> {
    const searchParams = new URLSearchParams();
    
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.transport_type) searchParams.set('transport_type', params.transport_type);
    if (params.source) searchParams.set('source', params.source);
    if (params.version) searchParams.set('version', params.version);
    if (params.category) searchParams.set('category', params.category);
    if (params.tags) searchParams.set('tags', params.tags);
    if (params.verified != null) searchParams.set('verified', String(params.verified));
    if (params.featured != null) searchParams.set('featured', String(params.featured));
    if (params.vendor_official != null) searchParams.set('vendor_official', String(params.vendor_official));

    const query = searchParams.toString();
    return this.request<ServerListResponse>(`/v0.1/servers${query ? `?${query}` : ''}`);
  }

  async getServerVersions(serverName: string): Promise<ServerListResponse> {
    const encoded = encodeURIComponent(serverName);
    return this.request<ServerListResponse>(`/v0.1/servers/${encoded}/versions`);
  }

  async getServerVersion(serverName: string, version: string): Promise<ServerResponse> {
    const encodedName = encodeURIComponent(serverName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<ServerResponse>(`/v0.1/servers/${encodedName}/versions/${encodedVersion}`);
  }

  async getTransports(): Promise<{ transports: string[]; description: Record<string, string> }> {
    return this.request('/v0.1/transports');
  }

  // Admin API

  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(response.token);
    return response;
  }

  logout() {
    this.setToken(null);
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/admin/me');
  }

  async getStats(): Promise<RegistryStats> {
    return this.request<RegistryStats>('/admin/stats');
  }

  async getSyncStatus(): Promise<{
    lastSync: string | null;
    status: string;
    error: string | null;
    isSyncing: boolean;
  }> {
    return this.request('/admin/sync/status');
  }

  async triggerSync(): Promise<{ message: string; status: string }> {
    return this.request('/admin/sync/trigger', { method: 'POST' });
  }

  async createServer(server: ServerDetail): Promise<ServerResponse> {
    return this.request<ServerResponse>('/admin/servers', {
      method: 'POST',
      body: JSON.stringify(server)
    });
  }

  async updateServer(
    serverName: string,
    version: string,
    updates: Partial<ServerDetail>
  ): Promise<ServerResponse> {
    const encodedName = encodeURIComponent(serverName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<ServerResponse>(
      `/admin/servers/${encodedName}/versions/${encodedVersion}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates)
      }
    );
  }

  async deleteServerVersion(serverName: string, version: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(serverName);
    const encodedVersion = encodeURIComponent(version);
    return this.request(`/admin/servers/${encodedName}/versions/${encodedVersion}`, {
      method: 'DELETE'
    });
  }

  async deleteServer(serverName: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(serverName);
    return this.request(`/admin/servers/${encodedName}`, {
      method: 'DELETE'
    });
  }

  // Runtime API

  async getRuntimeMetrics(): Promise<RuntimeMetricsResponse> {
    return this.request<RuntimeMetricsResponse>('/admin/runtime/metrics');
  }

  async listRuntimeInstances(): Promise<RuntimeListResponse> {
    return this.request<RuntimeListResponse>('/admin/runtime/instances');
  }

  async createRuntimeInstance(input: CreateRuntimeInstanceInput): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>('/admin/runtime/instances', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async getRuntimeInstance(id: string): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>(`/admin/runtime/instances/${id}`);
  }

  async updateRuntimeInstance(id: string, input: UpdateRuntimeInstanceInput): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>(`/admin/runtime/instances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  async deleteRuntimeInstance(id: string): Promise<{ message: string }> {
    return this.request(`/admin/runtime/instances/${id}`, {
      method: 'DELETE'
    });
  }

  async startRuntimeInstance(id: string): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>(`/admin/runtime/instances/${id}/start`, {
      method: 'POST'
    });
  }

  async stopRuntimeInstance(id: string): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>(`/admin/runtime/instances/${id}/stop`, {
      method: 'POST'
    });
  }

  async restartRuntimeInstance(id: string): Promise<RuntimeInstanceResponse> {
    return this.request<RuntimeInstanceResponse>(`/admin/runtime/instances/${id}/restart`, {
      method: 'POST'
    });
  }

  async getRuntimeInstanceLogs(id: string, tail: number = 200): Promise<RuntimeLogsResponse> {
    return this.request<RuntimeLogsResponse>(`/admin/runtime/instances/${id}/logs?tail=${tail}`);
  }

  async checkRuntimeInstanceHealth(id: string): Promise<{ health_status: string }> {
    return this.request(`/admin/runtime/instances/${id}/health`);
  }

  async syncRuntimeInstances(): Promise<RuntimeListResponse> {
    return this.request<RuntimeListResponse>('/admin/runtime/sync', {
      method: 'POST'
    });
  }

  async bulkStartRuntimeInstances(ids: string[]): Promise<{ results: { id: string; success: boolean }[] }> {
    return this.request('/admin/runtime/bulk/start', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  async bulkStopRuntimeInstances(ids: string[]): Promise<{ results: { id: string; success: boolean }[] }> {
    return this.request('/admin/runtime/bulk/stop', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  async createRuntimeFromCatalog(serverName: string, version?: string): Promise<RuntimeInstanceResponse & { detected: any }> {
    return this.request('/admin/runtime/instances/from-catalog', {
      method: 'POST',
      body: JSON.stringify({ server_name: serverName, version })
    });
  }

  // MCP Inspector API

  async getInspectCapabilities(id: string): Promise<McpCapabilities> {
    return this.request<McpCapabilities>(`/admin/runtime/instances/${id}/inspect`);
  }

  async callInspectTool(
    id: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    return this.request<McpToolResult>(
      `/admin/runtime/instances/${id}/inspect/tools/${encodeURIComponent(toolName)}`,
      { method: 'POST', body: JSON.stringify(args) }
    );
  }

  async readInspectResource(id: string, uri: string): Promise<McpResourceContents> {
    return this.request<McpResourceContents>(
      `/admin/runtime/instances/${id}/inspect/resources/read`,
      { method: 'POST', body: JSON.stringify({ uri }) }
    );
  }

  async getInspectPrompt(
    id: string,
    promptName: string,
    args: Record<string, string>
  ): Promise<McpPromptResult> {
    return this.request<McpPromptResult>(
      `/admin/runtime/instances/${id}/inspect/prompts/${encodeURIComponent(promptName)}`,
      { method: 'POST', body: JSON.stringify(args) }
    );
  }

  async getInspectHistory(id: string): Promise<InspectHistoryEntry[]> {
    const res = await this.request<{ history: InspectHistoryEntry[] }>(
      `/admin/runtime/instances/${id}/inspect/history`
    );
    return res.history;
  }

  // ── Skills API ────────────────────────────────────────────────────────

  async listSkills(params: SkillListParams = {}): Promise<SkillListResponse> {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.category) searchParams.set('category', params.category);
    if (params.tags) searchParams.set('tags', params.tags);
    if (params.verified != null) searchParams.set('verified', String(params.verified));
    if (params.featured != null) searchParams.set('featured', String(params.featured));
    if (params.format) searchParams.set('format', params.format);
    if (params.source) searchParams.set('source', params.source);
    const query = searchParams.toString();
    return this.request<SkillListResponse>(`/v0.1/skills${query ? `?${query}` : ''}`);
  }

  async getSkillVersions(skillName: string): Promise<SkillListResponse> {
    const encoded = encodeURIComponent(skillName);
    return this.request<SkillListResponse>(`/v0.1/skills/${encoded}/versions`);
  }

  async getSkillVersion(skillName: string, version: string): Promise<SkillResponse> {
    const encodedName = encodeURIComponent(skillName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<SkillResponse>(`/v0.1/skills/${encodedName}/versions/${encodedVersion}`);
  }

  async createSkill(skill: SkillDetail): Promise<SkillResponse> {
    return this.request<SkillResponse>('/admin/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    });
  }

  async updateSkill(skillName: string, version: string, updates: Partial<SkillDetail>): Promise<SkillResponse> {
    const encodedName = encodeURIComponent(skillName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<SkillResponse>(
      `/admin/skills/${encodedName}/versions/${encodedVersion}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    );
  }

  async deleteSkillVersion(skillName: string, version: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(skillName);
    const encodedVersion = encodeURIComponent(version);
    return this.request(`/admin/skills/${encodedName}/versions/${encodedVersion}`, { method: 'DELETE' });
  }

  async deleteSkill(skillName: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(skillName);
    return this.request(`/admin/skills/${encodedName}`, { method: 'DELETE' });
  }

  // ── Agents API ────────────────────────────────────────────────────────

  async listAgents(params: AgentListParams = {}): Promise<AgentListResponse> {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.category) searchParams.set('category', params.category);
    if (params.tags) searchParams.set('tags', params.tags);
    if (params.verified != null) searchParams.set('verified', String(params.verified));
    if (params.featured != null) searchParams.set('featured', String(params.featured));
    if (params.subagent_type) searchParams.set('subagent_type', params.subagent_type);
    if (params.source) searchParams.set('source', params.source);
    const query = searchParams.toString();
    return this.request<AgentListResponse>(`/v0.1/agents${query ? `?${query}` : ''}`);
  }

  async getAgentVersions(agentName: string): Promise<AgentListResponse> {
    const encoded = encodeURIComponent(agentName);
    return this.request<AgentListResponse>(`/v0.1/agents/${encoded}/versions`);
  }

  async getAgentVersion(agentName: string, version: string): Promise<AgentResponse> {
    const encodedName = encodeURIComponent(agentName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<AgentResponse>(`/v0.1/agents/${encodedName}/versions/${encodedVersion}`);
  }

  async createAgent(agent: AgentDetail): Promise<AgentResponse> {
    return this.request<AgentResponse>('/admin/agents', {
      method: 'POST',
      body: JSON.stringify(agent),
    });
  }

  async updateAgent(agentName: string, version: string, updates: Partial<AgentDetail>): Promise<AgentResponse> {
    const encodedName = encodeURIComponent(agentName);
    const encodedVersion = encodeURIComponent(version);
    return this.request<AgentResponse>(
      `/admin/agents/${encodedName}/versions/${encodedVersion}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    );
  }

  async deleteAgentVersion(agentName: string, version: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(agentName);
    const encodedVersion = encodeURIComponent(version);
    return this.request(`/admin/agents/${encodedName}/versions/${encodedVersion}`, { method: 'DELETE' });
  }

  async deleteAgent(agentName: string): Promise<{ message: string }> {
    const encodedName = encodeURIComponent(agentName);
    return this.request(`/admin/agents/${encodedName}`, { method: 'DELETE' });
  }

  // ── Agent Runtime API ─────────────────────────────────────────────────

  async listAgentInstances(): Promise<AgentInstanceListResponse> {
    return this.request<AgentInstanceListResponse>('/admin/agent-runtime/instances');
  }

  async createAgentInstance(data: { agent_name: string; agent_version: string }): Promise<AgentInstanceResponse> {
    return this.request<AgentInstanceResponse>('/admin/agent-runtime/instances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAgentInstance(id: string): Promise<AgentInstanceResponse> {
    return this.request<AgentInstanceResponse>(`/admin/agent-runtime/instances/${id}`);
  }

  async deleteAgentInstance(id: string): Promise<{ message: string }> {
    return this.request(`/admin/agent-runtime/instances/${id}`, { method: 'DELETE' });
  }

  async startAgentInstance(id: string): Promise<AgentInstanceResponse> {
    return this.request<AgentInstanceResponse>(`/admin/agent-runtime/instances/${id}/start`, { method: 'POST' });
  }

  async stopAgentInstance(id: string): Promise<AgentInstanceResponse> {
    return this.request<AgentInstanceResponse>(`/admin/agent-runtime/instances/${id}/stop`, { method: 'POST' });
  }

  async invokeAgent(id: string, input: string): Promise<AgentInvokeResponse> {
    return this.request<AgentInvokeResponse>(`/admin/agent-runtime/instances/${id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  async getAgentInvocations(id: string): Promise<{ invocations: AgentInvocation[] }> {
    return this.request<{ invocations: AgentInvocation[] }>(`/admin/agent-runtime/instances/${id}/invocations`);
  }

  async composeAgent(agentName: string, agentVersion: string): Promise<AgentComposeResponse> {
    return this.request<AgentComposeResponse>('/admin/agent-runtime/compose', {
      method: 'POST',
      body: JSON.stringify({ agent_name: agentName, agent_version: agentVersion }),
    });
  }
}

export const api = new ApiClient();
