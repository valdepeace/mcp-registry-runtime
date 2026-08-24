/**
 * Launching MCP commands portably.
 *
 * On Windows the tools MCPs are started with — npx, npm, yarn, pnpm, uv, pip —
 * are `.cmd` shims, and CreateProcess cannot exec a batch file. `spawn('npx')`
 * fails with ENOENT, and PM2 quietly drops the process without reporting
 * anything at all. Both have to go through `cmd /c`.
 *
 * Self-check: npx tsx apps/runtime/src/services/spawn-compat.ts
 */

export interface Launch {
  command: string;
  args: string[];
}

export function isNodeScript(cmd: string): boolean {
  return /\.(js|mjs|cjs)$/i.test(cmd);
}

/** Rewrite a command so the current platform can actually execute it. */
export function launchable(cmd: string, args: string[] = [], platform = process.platform): Launch {
  const needsShell =
    platform === 'win32' && !isNodeScript(cmd) && !/\.exe$/i.test(cmd);

  return needsShell
    ? { command: 'cmd', args: ['/c', cmd, ...args] }
    : { command: cmd, args };
}

// ── self-check ──
if (process.argv[1]?.endsWith('spawn-compat.ts')) {
  const eq = (got: unknown, want: unknown, label: string): void => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) throw new Error(`${label}: got ${a}, want ${b}`);
  };

  eq(launchable('npx', ['pkg', 'stdio'], 'win32'), { command: 'cmd', args: ['/c', 'npx', 'pkg', 'stdio'] }, 'windows wraps npx');
  eq(launchable('uv', ['run', 'x'], 'win32'), { command: 'cmd', args: ['/c', 'uv', 'run', 'x'] }, 'windows wraps uv');
  eq(launchable('docker.exe', ['run'], 'win32'), { command: 'docker.exe', args: ['run'] }, 'exe runs directly');
  eq(launchable('dist/index.js', [], 'win32'), { command: 'dist/index.js', args: [] }, 'node script untouched');
  eq(launchable('npx', ['pkg'], 'linux'), { command: 'npx', args: ['pkg'] }, 'posix untouched');
  eq(launchable('node', ['-e', 'x'], 'win32'), { command: 'cmd', args: ['/c', 'node', '-e', 'x'] }, 'bare node goes through cmd on windows');

  console.log('spawn-compat: all checks passed');
}
