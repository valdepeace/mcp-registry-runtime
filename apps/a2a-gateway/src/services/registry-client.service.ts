import { config } from '../config/index.js';

// The catalog is public (apps/registry's /v0.1/* routes) — no service token needed.
async function registryFetch<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${config.registryUrl}/v0.1${pathAndQuery}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `registry returned ${res.status}`);
  }
  return body as T;
}

export interface CatalogServer {
  server: {
    name: string;
    title?: string;
    description?: string;
    version: string;
    repository?: { url?: string; subfolder?: string };
  };
}

export const registryClient = {
  search: (query: string, limit = 10) =>
    registryFetch<{ servers: CatalogServer[] }>(`/servers?search=${encodeURIComponent(query)}&limit=${limit}`),
};
