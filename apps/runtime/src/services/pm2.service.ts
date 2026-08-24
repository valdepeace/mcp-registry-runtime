import pm2SDK from 'pm2';
import { readFileSync, existsSync } from 'fs';
import type { ProcessDescription } from 'pm2';
import type { RuntimeStatus, PM2ProcessInfo } from '@mcp/types';
import { launchable, isNodeScript } from './spawn-compat.js';

export class PM2Service {
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  static generatePM2Name(serverName: string, version: string): string {
    const sanitized = serverName.replace(/\//g, '--').replace(/@/g, '-at-');
    return `mcp--${sanitized}--${version}`;
  }

  private ensureConnected(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      pm2SDK.connect(false, (err) => {
        if (err) {
          this.connectPromise = null;
          reject(err);
        } else {
          this.connected = true;
          resolve();
        }
      });
    });

    const clearPromise = () => { this.connectPromise = null; };
    this.connectPromise.then(clearPromise, clearPromise);

    return this.connectPromise;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err) {
      this.connected = false;
      await this.ensureConnected();
      return fn();
    }
  }

  async start(
    pm2Name: string,
    cmd: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>
  ): Promise<void> {
    const { command: script, args: scriptArgs } = launchable(cmd, args);

    const options: pm2SDK.StartOptions = {
      name: pm2Name,
      script,
      args: scriptArgs.length > 0 ? scriptArgs : undefined,
      cwd,
      env: env ? ({ ...process.env, ...env } as Record<string, string>) : undefined,
      max_restarts: 5,
      interpreter: isNodeScript(cmd) ? undefined : 'none',
    };

    await this.run(() => new Promise<void>((resolve, reject) => {
      pm2SDK.start(options, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));

    // PM2 can accept a start and still not run anything. Without this check the
    // instance goes back to `stopped` with no explanation at all.
    const started = await this.describe(pm2Name);
    if (!started) {
      throw new Error(
        `PM2 accepted the start but no process appeared. \`${cmd}\` may not exist on this machine or may not be executable directly.`
      );
    }
  }

  async stop(pm2Name: string): Promise<void> {
    await this.run(() => new Promise<void>((resolve, reject) => {
      pm2SDK.stop(pm2Name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));
  }

  async restart(pm2Name: string): Promise<void> {
    await this.run(() => new Promise<void>((resolve, reject) => {
      pm2SDK.restart(pm2Name, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));
  }

  async delete(pm2Name: string): Promise<void> {
    try {
      await this.run(() => new Promise<void>((resolve, reject) => {
        pm2SDK.delete(pm2Name, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/process.*not found|unknown process/i.test(msg)) {
        return;
      }
      throw err;
    }
  }

  async describe(pm2Name: string): Promise<PM2ProcessInfo | null> {
    const all = await this.listAll();
    return all.find(p => p.name === pm2Name) ?? null;
  }

  async listMCPProcesses(): Promise<PM2ProcessInfo[]> {
    const all = await this.listAll();
    return all.filter(p => p.name.startsWith('mcp--'));
  }

  private listAll(): Promise<PM2ProcessInfo[]> {
    return this.run(() => new Promise<PM2ProcessInfo[]>((resolve, reject) => {
      pm2SDK.list((err, list) => {
        if (err) { reject(err); return; }
        resolve(list.map(proc => this.mapProcess(proc)));
      });
    }));
  }

  async logsTail(pm2Name: string, lines: number = 200): Promise<string> {
    let outPath: string | undefined;
    let errPath: string | undefined;

    try {
      await this.run(() => new Promise<void>((resolve) => {
        pm2SDK.describe(pm2Name, (err, list) => {
          if (!err && list?.length) {
            outPath = list[0].pm2_env?.pm_out_log_path;
            errPath = list[0].pm2_env?.pm_err_log_path;
          }
          resolve();
        });
      }));
    } catch {
      return '';
    }

    const tailFile = (filePath?: string): string[] => {
      if (!filePath || !existsSync(filePath)) return [];
      try {
        return readFileSync(filePath, 'utf-8').split('\n').slice(-lines);
      } catch {
        return [];
      }
    };

    const out = tailFile(outPath).join('\n').trim();
    const err = tailFile(errPath).join('\n').trim();

    if (out && err && outPath !== errPath) {
      return `=== stdout ===\n${out}\n\n=== stderr ===\n${err}`;
    }
    return out || err || '';
  }

  disconnect(): void {
    if (this.connected) {
      pm2SDK.disconnect();
      this.connected = false;
    }
  }

  private mapProcess(proc: ProcessDescription): PM2ProcessInfo {
    return {
      name: proc.name!,
      status: this.mapPM2Status(proc.pm2_env?.status ?? 'stopped'),
      pid: proc.pid,
      uptime_ms: proc.pm2_env?.pm_uptime
        ? Date.now() - proc.pm2_env.pm_uptime
        : undefined,
      restart_count: proc.pm2_env?.restart_time,
      memory: proc.monit?.memory,
      cpu: proc.monit?.cpu,
    };
  }

  private mapPM2Status(pm2Status: string): RuntimeStatus {
    switch (pm2Status) {
      case 'online':           return 'online';
      case 'stopping':         return 'stopping';
      case 'stopped':          return 'stopped';
      case 'launching':        return 'starting';
      case 'errored':
      case 'one-launch-status': return 'errored';
      default:                 return 'stopped';
    }
  }
}

export const pm2Service = new PM2Service();
