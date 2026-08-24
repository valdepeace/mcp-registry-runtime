import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { RuntimeInstance, StoredRuntimeInstance, RuntimeStatus } from '@mcp/types';
import type { CreateRuntimeInstanceInput, UpdateRuntimeInstanceInput } from '@mcp/types';
import { pm2Service, PM2Service } from './pm2.service.js';
import { runtimeEventBus } from './event-bus.js';

export class RuntimeService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createInstance(input: CreateRuntimeInstanceInput, status: RuntimeStatus = 'stopped'): RuntimeInstance {
    const id = randomUUID();
    const pm2Name = PM2Service.generatePM2Name(input.server_name, input.version);

    const endpointUrl = input.endpoint_url ?? (input.port ? `http://127.0.0.1:${input.port}/mcp` : null);
    const healthUrl = input.health_url ?? (input.port ? `http://127.0.0.1:${input.port}/mcp` : null);

    const stmt = this.db.prepare(`
      INSERT INTO runtime_instances (
        id, server_name, version, source, exec_cmd, exec_args, cwd, env_json,
        port, endpoint_url, health_url, pm2_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.server_name,
      input.version,
      input.source ?? null,
      input.exec_cmd,
      input.exec_args ? JSON.stringify(input.exec_args) : null,
      input.cwd ?? null,
      input.env_json ? JSON.stringify(input.env_json) : null,
      input.port ?? null,
      endpointUrl,
      healthUrl,
      pm2Name,
      status
    );

    const created = this.getInstance(id)!;
    runtimeEventBus.emitRuntime('instance:created', { instance: created });
    return created;
  }

  listInstances(): RuntimeInstance[] {
    const stmt = this.db.prepare<[], StoredRuntimeInstance>(`
      SELECT * FROM runtime_instances ORDER BY created_at DESC
    `);
    const rows = stmt.all();
    return rows.map(this.mapToRuntimeInstance);
  }

  getInstance(id: string): RuntimeInstance | null {
    const stmt = this.db.prepare<[string], StoredRuntimeInstance>(`
      SELECT * FROM runtime_instances WHERE id = ?
    `);
    const row = stmt.get(id);
    return row ? this.mapToRuntimeInstance(row) : null;
  }

  getInstanceByPM2Name(pm2Name: string): RuntimeInstance | null {
    const stmt = this.db.prepare<[string], StoredRuntimeInstance>(`
      SELECT * FROM runtime_instances WHERE pm2_name = ?
    `);
    const row = stmt.get(pm2Name);
    return row ? this.mapToRuntimeInstance(row) : null;
  }

  updateInstance(id: string, input: UpdateRuntimeInstanceInput): RuntimeInstance | null {
    const instance = this.getInstance(id);
    if (!instance) return null;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (input.exec_cmd !== undefined) {
      updates.push('exec_cmd = ?');
      params.push(input.exec_cmd);
    }
    if (input.exec_args !== undefined) {
      updates.push('exec_args = ?');
      params.push(JSON.stringify(input.exec_args));
    }
    if (input.cwd !== undefined) {
      updates.push('cwd = ?');
      params.push(input.cwd);
    }
    if (input.env_json !== undefined) {
      updates.push('env_json = ?');
      params.push(JSON.stringify(input.env_json));
    }
    if (input.port !== undefined) {
      updates.push('port = ?');
      params.push(input.port);
    }
    if (input.endpoint_url !== undefined) {
      updates.push('endpoint_url = ?');
      params.push(input.endpoint_url);
    }
    if (input.health_url !== undefined) {
      updates.push('health_url = ?');
      params.push(input.health_url);
    }

    if (updates.length === 0) return instance;

    updates.push("updated_at = datetime('now')");
    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE runtime_instances SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    const updated = this.getInstance(id);
    if (updated) {
      runtimeEventBus.emitRuntime('instance:updated', { instance: updated });
    }
    return updated;
  }

  async deleteInstance(id: string): Promise<boolean> {
    const instance = this.getInstance(id);
    if (!instance) return false;

    await pm2Service.delete(instance.pm2_name);

    const stmt = this.db.prepare(`DELETE FROM runtime_instances WHERE id = ?`);
    const result = stmt.run(id);
    if (result.changes > 0) {
      runtimeEventBus.emitRuntime('instance:deleted', { id });
    }
    return result.changes > 0;
  }

  async startInstance(id: string): Promise<RuntimeInstance | null> {
    const instance = this.getInstance(id);
    if (!instance) return null;

    if (instance.status === 'provisioning') {
      throw new Error('Instance is still being provisioned (clone / install / build in progress)');
    }

    this.updateStatus(id, 'starting');

    try {
      await pm2Service.start(
        instance.pm2_name,
        instance.exec_cmd,
        instance.exec_args ?? [],
        instance.cwd,
        instance.env_json
      );

      await this.sleep(1500);
      await this.syncStatusFromPM2(id);

      const updated = this.getInstance(id);
      if (updated?.status === 'online' && updated.health_url) {
        await this.sleep(500);
        await this.checkHealth(id);
      }

      return this.getInstance(id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const logs = await pm2Service.logsTail(instance.pm2_name, 20);
      const fullError = logs ? `${errorMsg}\n\nRecent logs:\n${logs}` : errorMsg;
      this.updateStatus(id, 'errored', fullError.slice(0, 2000));
      return this.getInstance(id);
    }
  }

  async stopInstance(id: string): Promise<RuntimeInstance | null> {
    const instance = this.getInstance(id);
    if (!instance) return null;

    this.updateStatus(id, 'stopping');

    try {
      await pm2Service.stop(instance.pm2_name);
      await this.sleep(500);
      await this.syncStatusFromPM2(id);
      return this.getInstance(id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.updateStatus(id, 'errored', errorMsg);
      return this.getInstance(id);
    }
  }

  async restartInstance(id: string): Promise<RuntimeInstance | null> {
    const instance = this.getInstance(id);
    if (!instance) return null;

    this.updateStatus(id, 'starting');

    try {
      await pm2Service.restart(instance.pm2_name);
      await this.sleep(1000);
      await this.syncStatusFromPM2(id);
      return this.getInstance(id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.updateStatus(id, 'errored', errorMsg);
      return this.getInstance(id);
    }
  }

  async getInstanceLogs(id: string, lines: number = 200): Promise<string> {
    const instance = this.getInstance(id);
    if (!instance) return '';

    return pm2Service.logsTail(instance.pm2_name, lines);
  }

  async checkHealth(id: string): Promise<'healthy' | 'unhealthy' | 'unknown'> {
    const instance = this.getInstance(id);
    if (!instance || !instance.health_url) return 'unknown';

    const pingUrl = async (headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number }> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(instance!.health_url!, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        controller.abort();
        return { ok: response.ok, status: response.status };
      } catch {
        clearTimeout(timeout);
        return { ok: false, status: 0 };
      }
    };

    try {
      const result = await pingUrl();

      // A live MCP endpoint answers a bare GET with 405 (wrong method) or 406
      // (missing SSE Accept header). Both mean the server is up and speaking.
      const healthStatus = (result.ok || result.status === 405 || result.status === 406) ? 'healthy' : 'unhealthy';
      this.updateHealthStatus(id, healthStatus);

      if (healthStatus === 'unhealthy' && instance.status === 'online') {
        this.updateStatus(id, 'degraded');
      } else if (healthStatus === 'healthy' && instance.status === 'degraded') {
        this.updateStatus(id, 'online');
      }

      return healthStatus;
    } catch {
      this.updateHealthStatus(id, 'unhealthy');
      if (instance.status === 'online') {
        this.updateStatus(id, 'degraded');
      }
      return 'unhealthy';
    }
  }

  async checkAllHealth(): Promise<void> {
    const instances = this.listInstances();
    const onlineInstances = instances.filter(i => 
      i.status === 'online' || i.status === 'degraded'
    );

    await Promise.all(onlineInstances.map(i => this.checkHealth(i.id)));
  }

  async syncStatusFromPM2(id?: string): Promise<void> {
    if (id) {
      const instance = this.getInstance(id);
      if (!instance) return;

      const pm2Info = await pm2Service.describe(instance.pm2_name);
      if (pm2Info) {
        this.updateStatusFromPM2(id, pm2Info.status, pm2Info.pid, pm2Info.uptime_ms, pm2Info.restart_count);
      } else if (!this.isPM2Exempt(instance.status)) {
        this.updateStatus(id, 'stopped');
      }
    } else {
      const instances = this.listInstances();
      const pm2Processes = await pm2Service.listMCPProcesses();
      const pm2Map = new Map(pm2Processes.map(p => [p.name, p]));

      for (const instance of instances) {
        const pm2Info = pm2Map.get(instance.pm2_name);
        if (pm2Info) {
          this.updateStatusFromPM2(instance.id, pm2Info.status, pm2Info.pid, pm2Info.uptime_ms, pm2Info.restart_count);
        } else if (!this.isPM2Exempt(instance.status)) {
          this.updateStatus(instance.id, 'stopped');
        }
      }
    }
  }

  /**
   * States PM2 knows nothing about, and must not overwrite.
   * `provisioning` has no process yet, and `errored` carries the reason it has
   * none — resetting either to `stopped` throws away the only explanation the
   * user gets for why the instance will not start.
   */
  private isPM2Exempt(status: RuntimeStatus): boolean {
    return status === 'provisioning' || status === 'errored';
  }

  /** Provisioning finished: the instance now has a real command and can be started. */
  setProvisioned(id: string): void {
    this.updateStatus(id, 'stopped');
  }

  /** Provisioning failed: keep the reason so the card can show it. */
  setProvisionFailed(id: string, error: string): void {
    this.updateStatus(id, 'errored', error.slice(0, 2000));
  }

  private updateStatus(id: string, status: RuntimeStatus, lastError?: string): void {
    const stmt = this.db.prepare(`
      UPDATE runtime_instances
      SET status = ?, last_error = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, lastError ?? null, id);
    runtimeEventBus.emitRuntime('instance:status', { id, status, last_error: lastError });
  }

  private updateStatusFromPM2(
    id: string,
    status: RuntimeStatus,
    pid?: number,
    uptimeMs?: number,
    restartCount?: number
  ): void {
    const stmt = this.db.prepare(`
      UPDATE runtime_instances
      SET status = ?, pid = ?, uptime_ms = ?, restart_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, pid ?? null, uptimeMs ?? null, restartCount ?? null, id);
    runtimeEventBus.emitRuntime('instance:status', { id, status });
  }

  private updateHealthStatus(id: string, healthStatus: 'healthy' | 'unhealthy' | 'unknown'): void {
    const stmt = this.db.prepare(`
      UPDATE runtime_instances
      SET health_status = ?, last_health_check = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(healthStatus, id);
    runtimeEventBus.emitRuntime('instance:health', {
      id,
      health_status: healthStatus,
      last_health_check: new Date().toISOString(),
    });
  }

  private mapToRuntimeInstance(row: StoredRuntimeInstance): RuntimeInstance {
    return {
      id: row.id,
      server_name: row.server_name,
      version: row.version,
      source: row.source as RuntimeInstance['source'],
      exec_cmd: row.exec_cmd,
      exec_args: row.exec_args ? JSON.parse(row.exec_args) : undefined,
      cwd: row.cwd ?? undefined,
      env_json: row.env_json ? JSON.parse(row.env_json) : undefined,
      port: row.port ?? undefined,
      endpoint_url: row.endpoint_url ?? undefined,
      health_url: row.health_url ?? undefined,
      pm2_name: row.pm2_name,
      status: row.status as RuntimeStatus,
      pid: row.pid ?? undefined,
      uptime_ms: row.uptime_ms ?? undefined,
      restart_count: row.restart_count ?? undefined,
      last_exit_code: row.last_exit_code ?? undefined,
      last_error: row.last_error ?? undefined,
      health_status: row.health_status as RuntimeInstance['health_status'],
      last_health_check: row.last_health_check ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  startMetricsPolling(intervalMs = 3000): void {
    setInterval(async () => {
      try {
        const [pm2Processes, instances] = await Promise.all([
          pm2Service.listMCPProcesses(),
          Promise.resolve(this.listInstances()),
        ]);

        const metrics = instances.map(inst => {
          const pm2 = pm2Processes.find(p => p.name === inst.pm2_name);
          return {
            id: inst.id,
            server_name: inst.server_name,
            version: inst.version,
            pm2_name: inst.pm2_name,
            status: pm2?.status ?? inst.status,
            pid: pm2?.pid ?? inst.pid,
            uptime_ms: pm2?.uptime_ms ?? inst.uptime_ms,
            restart_count: pm2?.restart_count ?? inst.restart_count,
            memory: pm2?.memory,
            cpu: pm2?.cpu,
          };
        });

        runtimeEventBus.emitRuntime('runtime:metrics', { metrics });
      } catch {
        // polling errors are non-fatal
      }
    }, intervalMs);
  }
}
