#!/usr/bin/env node
/**
 * Generic launcher PM2 spawns directly (a plain .mjs — no `cmd /c` needed to
 * start it) so it can pipe its child's stdout/stderr into files itself,
 * instead of relying on cmd.exe's `>>` file redirection.
 *
 * That redirection was tried first and is genuinely broken specifically when
 * the immediate parent is PM2's own daemon on Windows — verified directly:
 * the identical `cmd /c "<cmd> 1>> out.log"` (even via a wrapper .bat, ruling
 * out Node's own arg-mangling of `>>`) captures output fine when spawned by
 * hand, but silently drops it when PM2 is the one spawning it. Piping through
 * Node's own streams sidesteps cmd.exe's redirection — and the OS-level
 * handle inheritance PM2 breaks for it — entirely.
 *
 * Usage: node launch-and-log.mjs <outLogPath> <errLogPath> <cmd> [args...]
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const [, , outPath, errPath, cmd, ...args] = process.argv;

if (!outPath || !errPath || !cmd) {
  console.error('usage: launch-and-log.mjs <outLogPath> <errLogPath> <cmd> [args...]');
  process.exit(1);
}

const outStream = createWriteStream(outPath, { flags: 'a' });
const errStream = createWriteStream(errPath, { flags: 'a' });

// shell:true on Windows is what lets a bare `npx`/`npm`/`uv` (a .cmd shim)
// resolve at all — same reason the rest of this codebase wraps them through
// cmd.exe. Node's own shell handling here, not our own hand-rolled wrapping.
const child = spawn(cmd, args, {
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.pipe(outStream);
child.stderr.pipe(errStream);

child.on('error', (err) => {
  errStream.write(`[launch-and-log] failed to start '${cmd}': ${err.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => child.kill(sig));
}
