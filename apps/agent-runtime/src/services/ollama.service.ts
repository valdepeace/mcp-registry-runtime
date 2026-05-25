import { config } from '../config/index.js';

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  expires_at: string;
  size_vram: number;
  details: OllamaModel['details'];
}

export interface OllamaStatus {
  running: boolean;
  version: string | null;
}

export interface OllamaPullProgress {
  type: 'status' | 'progress' | 'complete' | 'error';
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export class OllamaService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.ollamaUrl;
  }

  async getStatus(): Promise<OllamaStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { running: false, version: null };
      const data = await response.json() as { version: string };
      return { running: true, version: data.version };
    } catch {
      return { running: false, version: null };
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json() as { models: OllamaModel[] };
    return data.models ?? [];
  }

  async listRunning(): Promise<OllamaRunningModel[]> {
    const response = await fetch(`${this.baseUrl}/api/ps`);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json() as { models: OllamaRunningModel[] };
    return data.models ?? [];
  }

  async deleteModel(name: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Ollama error: ${response.status}`);
    }
  }

  async *pullModel(name: string): AsyncGenerator<OllamaPullProgress> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    });

    if (!response.ok) {
      const body = await response.text();
      yield { type: 'error', error: body || `Ollama error: ${response.status}` };
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed) as {
              status: string;
              digest?: string;
              total?: number;
              completed?: number;
              error?: string;
            };

            if (event.error) {
              yield { type: 'error', error: event.error };
              return;
            }

            if (event.status === 'success') {
              yield { type: 'complete', status: 'success' };
              return;
            }

            if (event.total !== undefined) {
              yield {
                type: 'progress',
                status: event.status,
                digest: event.digest,
                total: event.total,
                completed: event.completed ?? 0,
              };
            } else {
              yield { type: 'status', status: event.status };
            }
          } catch {
            // skip malformed ndjson line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'complete', status: 'success' };
  }
}

export const ollamaService = new OllamaService();
