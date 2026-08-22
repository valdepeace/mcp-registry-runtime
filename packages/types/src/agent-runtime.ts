/**
 * Agent Runtime Types
 * Shapes for agent instances managed by the agent-runtime app (Mastra-backed).
 *
 * JSON-encoded fields decision:
 *   exec_args, resolved_skills, resolved_mcp_instances are stored in SQLite as
 *   JSON-encoded TEXT and are returned AS-IS (string | null) by the API — there
 *   is no deserialization in the route handlers or database.service.ts.
 *   The wire type therefore keeps them as string | null to match what the API
 *   actually sends; callers must JSON.parse() themselves when needed.
 */

import type { AgentDetail } from './agents.js';

// ---- Enums ------------------------------------------------------------------

export type AgentInstanceStatus =
  | 'stopped'
  | 'starting'
  | 'online'
  | 'stopping'
  | 'errored';

export type InvocationStatus = 'success' | 'error' | 'pending';

// ---- Wire types (DB row = API response, 1-to-1 mirror) ----------------------

/**
 * AgentInstance mirrors StoredAgentInstance from apps/agent-runtime.
 * exec_args / resolved_skills / resolved_mcp_instances are JSON-encoded strings
 * on the wire (see file-level comment above).
 */
export interface AgentInstance {
  id: string;
  agent_name: string;
  agent_version: string;
  status: AgentInstanceStatus;
  exec_cmd: string;
  /** JSON-encoded string[] or null */
  exec_args: string | null;
  /** JSON-encoded Record<string, string> or null */
  env_json: string | null;
  /** JSON-encoded string[] (skill refs "name@version") or null */
  resolved_skills: string | null;
  /** JSON-encoded string[] (mcp server refs "name@version") or null */
  resolved_mcp_instances: string | null;
  composed_prompt: string | null;
  pm2_name: string | null;
  pid: number | null;
  uptime_ms: number | null;
  restart_count: number | null;
  last_exit_code: number | null;
  last_error: string | null;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_invoked_at: string | null;
  last_composed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Invocation mirrors StoredInvocation from apps/agent-runtime.
 */
export interface Invocation {
  id: number;
  instance_id: string;
  input: string;
  output: string | null;
  status: InvocationStatus;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ---- Composer types ---------------------------------------------------------

export interface ResolvedSkill {
  name: string;
  version: string;
  content: string;
  format: string;
}

export interface ResolvedMCPServer {
  name: string;
  version: string;
  instanceId?: string;
  tools?: string[];
}

/**
 * ComposedAgent is the shape returned by POST /admin/agent-runtime/compose.
 * Re-exported from agent-composer.service.ts (was not previously in @mcp/types).
 */
export interface ComposedAgent {
  agent: AgentDetail;
  resolvedSkills: ResolvedSkill[];
  resolvedMCPServers: ResolvedMCPServer[];
  composedPrompt: string;
}

// ---- API response envelopes -------------------------------------------------

export interface AgentInstanceListResponse {
  instances: AgentInstance[];
}

export interface AgentInstanceResponse {
  instance: AgentInstance;
}

export interface InvocationListResponse {
  invocations: Invocation[];
}

export interface InvokeAgentResponse {
  instance: AgentInstance;
  output: string;
}

export interface ComposeResponse {
  composed: ComposedAgent;
}
