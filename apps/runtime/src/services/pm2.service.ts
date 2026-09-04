import pm2SDK from 'pm2';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { ProcessDescription } from 'pm2';
import type { RuntimeStatus, PM2ProcessInfo } from '@mcp/types';
import { launchable, isNodeScript, type LogPaths } from './spawn-compat.js';
import { config } from '../config/index.js';

/** Where a shell-wrapped Windows launch (see spawn-compat.ts) writes its own
 *  stdout/stderr, since PM2 doesn't capture that case natively there. */
function ownLogPaths(pm2Name: string): LogPaths {
  return {
    out: path.join(config.logsDir, `${pm2Name}-out.log`),
    err: path.join(config.logsDir, `${pm2Name}-err.log`),
  };
}

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
    env?: Record<string, string>,
    isStdio = false
  ): Promise<void> {
    mkdirSync(config.logsDir, { recursive: true });
    const { command: script, args: scriptArgs } = launchable(cmd, args, process.platform, ownLogPaths(pm2Name));

    // PM2 keeps an app's *previous* script/args/interpreter when you `start`
    // a name it already knows, silently ignoring whatever's passed here —
    // verified directly (an edited command kept running the old one until
    // the process was deleted first). Delete any stale definition so this
    // start always actually applies what's asked for.
    await this.delete(pm2Name);

    const options: pm2SDK.StartOptions = {
      name: pm2Name,
      script,
      args: scriptArgs.length > 0 ? scriptArgs : undefined,
      cwd,
      env: env ? ({ ...process.env, ...env } as Record<string, string>) : undefined,
      // A stdio MCP is a command that sends/receives on stdin/stdout and
      // exits — not a long-running service. Exiting is its normal life
      // cycle, not a crash, so PM2 must never relaunch it on its own; only an
      // explicit Start/Restart from the dashboard should. HTTP-transport
      // instances (endpoint_url/port set) are real always-on servers, so they
      // keep the crash-loop circuit breaker below.
      autorestart: !isStdio,
      // Circuit breaker for crash loops (HTTP instances only): PM2 only
      // counts a restart as "unstable" if the process dies within min_uptime
      // of starting, and once unstable_restarts hits max_restarts within that
      // window it stops touching the process for good — no infinite retry,
      // ever (verified in pm2's own God.js). Explicit here instead of relying
      // on PM2's default.
      min_uptime: 3000,
      max_restarts: 5,
      // Without a delay, a server that crashes on startup burns through all 5
      // restarts almost instantly — a rapid start/stop churn that shows up as
      // flapping status in the dashboard. Back off exponentially instead.
      exp_backoff_restart_delay: 100,
      // Only the untouched direct-launch case (script === cmd) can still be a
      // bare .js file PM2 should auto-interpret with node; every wrapped case
      // (cmd.exe, or our own launch-and-log.mjs via process.execPath) is
      // already a concrete executable.
      interpreter: script === cmd && isNodeScript(cmd) ? undefined : 'none',
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
    const tailFile = (filePath?: string): string[] => {
      if (!filePath || !existsSync(filePath)) return [];
      try {
        return readFileSync(filePath, 'utf-8').split('\n').slice(-lines);
      } catch {
        return [];
      }
    };

    const render = (outPath: string | undefined, out: string, errPath: string | undefined, err: string): string => {
      if (out && err && outPath !== errPath) {
        return `=== stdout ===\n${out}\n\n=== stderr ===\n${err}`;
      }
      return out || err || '';
    };

    // Windows cmd-wrapped launches (npx/npm/uv — see spawn-compat.ts) redirect
    // their own output here, since PM2 never captures it through `cmd /c`.
    // Check these first; they're empty for anything PM2 does capture natively.
    const own = ownLogPaths(pm2Name);
    const ownOut = tailFile(own.out).join('\n').trim();
    const ownErr = tailFile(own.err).join('\n').trim();
    if (ownOut || ownErr) {
      return render(own.out, ownOut, own.err, ownErr);
    }

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

    const out = tailFile(outPath).join('\n').trim();
    const err = tailFile(errPath).join('\n').trim();

    return render(outPath, out, errPath, err);
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
