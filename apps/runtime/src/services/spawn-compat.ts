/**
 * Launching MCP commands portably.
 *
 * On Windows the tools MCPs are started with — npx, npm, yarn, pnpm, uv, pip —
 * are `.cmd` shims, and CreateProcess cannot exec a batch file. `spawn('npx')`
 * fails with ENOENT, and PM2 quietly drops the process without reporting
 * anything at all. Both have to go through a shell.
 *
 * That wrapping has its own side effect: PM2 on Windows never captures
 * stdout/stderr from a process nested under `cmd /c` — verified two ways:
 * a bare `console.log` in the wrapped process never reaches PM2's own log
 * pipe, and — the fallback tried next — cmd.exe's own `>>` file redirection
 * *also* silently drops the output specifically when PM2's daemon is the one
 * spawning it (the identical command captures fine run by hand). So when log
 * paths are supplied, PM2 is pointed at `scripts/launch-and-log.mjs` instead
 * — a plain .mjs, so PM2 spawns it directly with no cmd.exe involved at all
 *  — which spawns the real command itself and pipes its output into the log
 * files with Node's own streams.
 *
 * Self-check: npx tsx apps/runtime/src/services/spawn-compat.ts
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LAUNCHER_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/launch-and-log.mjs'
);

export interface Launch {
  command: string;
  args: string[];
}

export interface LogPaths {
  out: string;
  err: string;
}

export function isNodeScript(cmd: string): boolean {
  return /\.(js|mjs|cjs)$/i.test(cmd);
}

/**
 * Rewrite a command so the current platform can actually execute it.
 *
 * `logPaths`, when given, routes the launch through `launch-and-log.mjs`
 * (see module docs) instead of relying on PM2's own log capture — needed on
 * Windows for anything that isn't already a direct .exe/.js launch, since
 * PM2 doesn't capture those (nor their `cmd /c` file-redirect workaround)
 * itself there. Ignored on POSIX, where PM2 captures every case natively.
 */
export function launchable(cmd: string, args: string[] = [], platform = process.platform, logPaths?: LogPaths): Launch {
  const needsShell =
    platform === 'win32' && !isNodeScript(cmd) && !/\.exe$/i.test(cmd);

  if (needsShell && logPaths) {
    return { command: process.execPath, args: [LAUNCHER_SCRIPT, logPaths.out, logPaths.err, cmd, ...args] };
  }

  if (!needsShell) {
    return { command: cmd, args };
  }

  return { command: 'cmd', args: ['/c', cmd, ...args] };
}

// ── self-check ──
if (process.argv[1]?.endsWith('spawn-compat.ts')) {
  const eq = (got: unknown, want: unknown, label: string): void => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) throw new Error(`${label}: got ${a}, want ${b}`);
  };

  eq(launchable('npx', ['pkg', 'stdio'], 'win32'), { command: 'cmd', args: ['/c', 'npx', 'pkg', 'stdio'] }, 'windows wraps npx (no logPaths)');
  eq(launchable('uv', ['run', 'x'], 'win32'), { command: 'cmd', args: ['/c', 'uv', 'run', 'x'] }, 'windows wraps uv (no logPaths)');
  eq(launchable('docker.exe', ['run'], 'win32'), { command: 'docker.exe', args: ['run'] }, 'exe runs directly');
  eq(launchable('dist/index.js', [], 'win32'), { command: 'dist/index.js', args: [] }, 'node script untouched');
  eq(launchable('npx', ['pkg'], 'linux'), { command: 'npx', args: ['pkg'] }, 'posix untouched');
  eq(launchable('node', ['-e', 'x'], 'win32'), { command: 'cmd', args: ['/c', 'node', '-e', 'x'] }, 'bare node goes through cmd on windows (no logPaths)');

  const logPaths = { out: 'C:\\logs\\a-out.log', err: 'C:\\logs\\a-err.log' };
  eq(
    launchable('npm', ['start'], 'win32', logPaths),
    { command: process.execPath, args: [LAUNCHER_SCRIPT, 'C:\\logs\\a-out.log', 'C:\\logs\\a-err.log', 'npm', 'start'] },
    'windows + logPaths routes through launch-and-log.mjs instead of relying on PM2/cmd.exe capture'
  );
  eq(
    launchable('docker.exe', ['run'], 'win32', logPaths),
    { command: 'docker.exe', args: ['run'] },
    'logPaths ignored for a direct .exe launch (PM2 captures it fine)'
  );
  eq(
    launchable('npx', ['pkg'], 'linux', logPaths),
    { command: 'npx', args: ['pkg'] },
    'logPaths ignored on POSIX (PM2 captures every case there)'
  );

  console.log('spawn-compat: all checks passed');
}
