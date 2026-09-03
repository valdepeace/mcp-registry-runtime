import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Talks to apps/runtime's admin API on an external agent's behalf. The agent
 * never sees this token — it's minted fresh per call and expires in minutes,
 * same secret as the dashboard's own admin login (apps/runtime's JWT_SECRET)
 * so no separate credential has to be provisioned there.
 */
function serviceToken(): string {
  return jwt.sign(
    { id: 0, username: 'a2a-gateway', role: 'admin' },
    config.jwtSecret,
    { expiresIn: config.serviceJwtTtl as jwt.SignOptions['expiresIn'] }
  );
}

async function runtimeFetch<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.runtimeUrl}/admin/runtime${pathAndQuery}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${serviceToken()}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `runtime returned ${res.status}`);
  }
  return body as T;
}

export interface RuntimeInstance {
  id: string;
  server_name: string;
  version: string;
  pm2_name: string;
  status: string;
  endpoint_url?: string;
  health_url?: string;
  port?: number;
}

export const runtimeClient = {
  listInstances: () => runtimeFetch<{ instances: RuntimeInstance[] }>('/instances'),

  getInstance: (id: string) => runtimeFetch<{ instance: RuntimeInstance }>(`/instances/${encodeURIComponent(id)}`),

  createFromCatalog: (serverName: string, version: string | undefined, autoStart: boolean) =>
    runtimeFetch<{ instance: RuntimeInstance; message?: string }>('/instances/from-catalog', {
      method: 'POST',
      body: JSON.stringify({ server_name: serverName, version, auto_start: autoStart }),
    }),

  startInstance: (id: string) =>
    runtimeFetch<{ instance: RuntimeInstance }>(`/instances/${encodeURIComponent(id)}/start`, { method: 'POST' }),
};
