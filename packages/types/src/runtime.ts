/**
 * Runtime Instance Types
 * For managing locally running MCP server processes via PM2
 */

export type RuntimeStatus = 'stopped' | 'starting' | 'online' | 'stopping' | 'errored' | 'degraded';

export interface RuntimeInstance {
  id: string;
  server_name: string;
  version: string;
  source?: 'registry' | 'private' | 'azure-devops';

  // Execution recipe
  exec_cmd: string;
  exec_args?: string[];
  cwd?: string;
  env_json?: Record<string, string>;
  port?: number;
  endpoint_url?: string;
  health_url?: string;

  // PM2 state (cached, can be refreshed from PM2)
  pm2_name: string;
  status: RuntimeStatus;
  pid?: number;
  uptime_ms?: number;
  restart_count?: number;
  last_exit_code?: number;
  last_error?: string;
  
  // Health check state
  health_status?: 'healthy' | 'unhealthy' | 'unknown';
  last_health_check?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface StoredRuntimeInstance {
  id: string;
  server_name: string;
  version: string;
  source: string | null;
  exec_cmd: string;
  exec_args: string | null;
  cwd: string | null;
  env_json: string | null;
  port: number | null;
  endpoint_url: string | null;
  health_url: string | null;
  pm2_name: string;
  status: string;
  pid: number | null;
  uptime_ms: number | null;
  restart_count: number | null;
  last_exit_code: number | null;
  last_error: string | null;
  health_status: string | null;
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
}

export interface PM2ProcessInfo {
  name: string;
  status: RuntimeStatus;
  pid?: number;
  uptime_ms?: number;
  restart_count?: number;
  memory?: number;
  cpu?: number;
}
