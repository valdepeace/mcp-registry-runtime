import { spawn } from 'child_process';
import { createInterface } from 'readline';
import type { RuntimeInstance } from '@mcp-nova/types';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, McpPropertySchema>;
    required?: string[];
  };
}

export interface McpPropertySchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: McpPropertySchema;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpCapabilities {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface McpResourceContents {
  contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
}

export interface McpPromptResult {
  description?: string;
  messages: Array<{ role: string; content: { type: string; text?: string } }>;
}

interface StdioSession {
  rpc: (method: string, params: unknown, timeoutMs?: number) => Promise<unknown>;
  notify: (method: string) => void;
  cleanup: () => void;
}

class McpInspectorService {
  private async fetchRpc(
    endpoint: string,
    method: string,
    params: unknown,
    sessionId: string | null,
    timeoutMs = 30_000
  ): Promise<{ result: unknown; sessionId: string | null }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `Cannot connect to MCP server at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (response.status === 405) {
      clearTimeout(timer);
      throw new Error(
        'MCP server rejected Streamable HTTP. Only Streamable HTTP transport is supported for HTTP inspection.'
      );
    }

    const respSessionId = response.headers.get('mcp-session-id') ?? sessionId;

    if (response.status === 202) {
      clearTimeout(timer);
      await response.body?.cancel();
      return { result: null, sessionId: respSessionId };
    }

    if (!response.ok) {
      clearTimeout(timer);
      const body = await response.text().catch(() => '');
      throw new Error(`MCP server returned HTTP ${response.status}: ${body}`);
    }
    const contentType = response.headers.get('content-type') ?? '';

    let rpcResponse: unknown;
    try {
      if (contentType.includes('text/event-stream')) {
        rpcResponse = await this.parseSseResponse(response, controller.signal);
      } else {
        rpcResponse = await response.json();
      }
    } finally {
      clearTimeout(timer);
    }

    const rpc = rpcResponse as { error?: { code: number; message: string }; result?: unknown };
    if (rpc.error) {
      throw new Error(`MCP error [${rpc.error.code}]: ${rpc.error.message}`);
    }

    return { result: rpc.result ?? null, sessionId: respSessionId };
  }

  private async parseSseResponse(response: Response, signal: AbortSignal): Promise<unknown> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let found: unknown = null;

    const onAbort = () => reader.cancel().catch(() => {});
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      while (true) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch {
          break;
        }

        if (done) break;
        buffer += decoder.decode(value!, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6).trimEnd()) as { id?: unknown };
              if (parsed.id !== undefined) {
                found = parsed;
              }
            } catch {
              // Not a valid JSON-RPC message — keep reading
            }
          }
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      reader.releaseLock();
    }

    if (!found) {
      throw new Error('No JSON-RPC response found in MCP server SSE stream');
    }
    return found;
  }

  private async connectHttp(endpoint: string): Promise<string | null> {
    const { sessionId } = await this.fetchRpc(endpoint, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-nova-inspector', version: '1.0.0' },
    }, null);

    try {
      const notifHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      };
      if (sessionId) notifHeaders['Mcp-Session-Id'] = sessionId;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: notifHeaders,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });
      await r.body?.cancel();
    } catch {
      // Non-fatal — proceed even if notification fails
    }

    return sessionId;
  }

  private async connectStdio(instance: RuntimeInstance): Promise<StdioSession> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    Object.assign(env, instance.env_json ?? {});

    const child = spawn(instance.exec_cmd, instance.exec_args ?? [], {
      cwd: instance.cwd ?? undefined,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let idCounter = 1;
    const pending = new Map<number, {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
    }>();

    const rejectAll = (reason: string) => {
      for (const { reject } of pending.values()) {
        reject(new Error(reason));
      }
      pending.clear();
    };

    child.on('error', (err) => rejectAll(`Stdio process error: ${err.message}`));
    child.on('exit', (code) => rejectAll(`Stdio process exited with code ${code}`));

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as {
          id?: number;
          result?: unknown;
          error?: { code: number; message: string };
        };
        if (msg.id !== undefined && pending.has(msg.id)) {
          const handlers = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) {
            handlers.reject(new Error(`MCP error [${msg.error.code}]: ${msg.error.message}`));
          } else {
            handlers.resolve(msg.result ?? null);
          }
        }
      } catch {
        // non-JSON output (startup messages, logs) — ignore
      }
    });

    const rpc = (method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const id = idCounter++;
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`Timeout waiting for "${method}" response`));
          }
        }, timeoutMs);
        pending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
        child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    };

    const notify = (method: string) => {
      child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    };

    const cleanup = () => {
      rl.close();
      try { child.stdin!.end(); } catch { /* ignore */ }
      setTimeout(() => { if (!child.killed) child.kill(); }, 500);
    };

    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-nova-inspector', version: '1.0.0' },
    });
    notify('notifications/initialized');

    return { rpc, notify, cleanup };
  }

  async getCapabilities(instance: RuntimeInstance): Promise<McpCapabilities> {
    if (instance.endpoint_url) {
      if (instance.status !== 'online' && instance.status !== 'degraded') {
        throw new Error(
          `Instance is not running (status: ${instance.status}). Start it first.`
        );
      }
      const endpoint = instance.endpoint_url;
      const sessionId = await this.connectHttp(endpoint);

      const toolsRes   = await this.fetchRpc(endpoint, 'tools/list',     {}, sessionId).catch(() => null);
      const resourcesRes = await this.fetchRpc(endpoint, 'resources/list', {}, sessionId).catch(() => null);
      const promptsRes = await this.fetchRpc(endpoint, 'prompts/list',   {}, sessionId).catch(() => null);

      return {
        tools:     ((toolsRes?.result     as Record<string, unknown>)?.tools     as McpTool[])     ?? [],
        resources: ((resourcesRes?.result as Record<string, unknown>)?.resources as McpResource[]) ?? [],
        prompts:   ((promptsRes?.result   as Record<string, unknown>)?.prompts   as McpPrompt[])   ?? [],
      };
    } else {
      const session = await this.connectStdio(instance);
      try {
        const [toolsRes, resourcesRes, promptsRes] = await Promise.allSettled([
          session.rpc('tools/list', {}),
          session.rpc('resources/list', {}),
          session.rpc('prompts/list', {}),
        ]);
        return {
          tools: toolsRes.status === 'fulfilled'
            ? ((toolsRes.value as Record<string, unknown>)?.tools as McpTool[]) ?? []
            : [],
          resources: resourcesRes.status === 'fulfilled'
            ? ((resourcesRes.value as Record<string, unknown>)?.resources as McpResource[]) ?? []
            : [],
          prompts: promptsRes.status === 'fulfilled'
            ? ((promptsRes.value as Record<string, unknown>)?.prompts as McpPrompt[]) ?? []
            : [],
        };
      } finally {
        session.cleanup();
      }
    }
  }

  async callTool(
    instance: RuntimeInstance,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    if (instance.endpoint_url) {
      if (instance.status !== 'online' && instance.status !== 'degraded') {
        throw new Error(`Instance is not running (status: ${instance.status}). Start it first.`);
      }
      const sessionId = await this.connectHttp(instance.endpoint_url);
      const { result } = await this.fetchRpc(
        instance.endpoint_url,
        'tools/call',
        { name: toolName, arguments: args },
        sessionId,
        60_000
      );
      return result as McpToolResult;
    } else {
      const session = await this.connectStdio(instance);
      try {
        const result = await session.rpc(
          'tools/call',
          { name: toolName, arguments: args },
          60_000
        );
        return result as McpToolResult;
      } finally {
        session.cleanup();
      }
    }
  }

  async readResource(instance: RuntimeInstance, uri: string): Promise<McpResourceContents> {
    if (instance.endpoint_url) {
      if (instance.status !== 'online' && instance.status !== 'degraded') {
        throw new Error(`Instance is not running (status: ${instance.status}). Start it first.`);
      }
      const sessionId = await this.connectHttp(instance.endpoint_url);
      const { result } = await this.fetchRpc(instance.endpoint_url, 'resources/read', { uri }, sessionId);
      return result as McpResourceContents;
    } else {
      const session = await this.connectStdio(instance);
      try {
        const result = await session.rpc('resources/read', { uri });
        return result as McpResourceContents;
      } finally {
        session.cleanup();
      }
    }
  }

  async getPrompt(
    instance: RuntimeInstance,
    promptName: string,
    args: Record<string, string>
  ): Promise<McpPromptResult> {
    if (instance.endpoint_url) {
      if (instance.status !== 'online' && instance.status !== 'degraded') {
        throw new Error(`Instance is not running (status: ${instance.status}). Start it first.`);
      }
      const sessionId = await this.connectHttp(instance.endpoint_url);
      const { result } = await this.fetchRpc(
        instance.endpoint_url,
        'prompts/get',
        { name: promptName, arguments: args },
        sessionId
      );
      return result as McpPromptResult;
    } else {
      const session = await this.connectStdio(instance);
      try {
        const result = await session.rpc('prompts/get', { name: promptName, arguments: args });
        return result as McpPromptResult;
      } finally {
        session.cleanup();
      }
    }
  }
}

export const mcpInspectorService = new McpInspectorService();
