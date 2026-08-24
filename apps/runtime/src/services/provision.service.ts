import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { gitService } from './git.service.js';
import type { RuntimeService } from './runtime.service.js';
import { runtimeEventBus } from './event-bus.js';

const execAsync = promisify(exec);

/** Placeholder command an instance carries while its source is being built. */
export const PENDING_PROVISION = 'pending-provision';

export interface Cmd {
  cmd: string;
  args: string[];
}

export interface ProjectPlan {
  kind: 'node' | 'python' | 'docker';
  /** Run in order before the MCP can start: dependency install, then build. */
  setup: Cmd[];
  /** What PM2 will keep running. */
  start: Cmd;
}

function has(dir: string, file: string): boolean {
  return fs.existsSync(path.join(dir, file));
}

function readJson(dir: string, file: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
  } catch {
    return null;
  }
}

function planNode(dir: string): ProjectPlan | null {
  const pkg = readJson(dir, 'package.json');
  if (!pkg) return null;

  const setup: Cmd[] = [];
  if (has(dir, 'pnpm-lock.yaml')) setup.push({ cmd: 'pnpm', args: ['install'] });
  else if (has(dir, 'yarn.lock')) setup.push({ cmd: 'yarn', args: ['install'] });
  else if (has(dir, 'package-lock.json')) setup.push({ cmd: 'npm', args: ['ci'] });
  else setup.push({ cmd: 'npm', args: ['install'] });

  // Most MCP servers are TypeScript and ship no dist/ in the repo.
  if (pkg.scripts?.build) setup.push({ cmd: 'npm', args: ['run', 'build'] });

  let start: Cmd;
  if (pkg.scripts?.start) {
    start = { cmd: 'npm', args: ['start'] };
  } else {
    const bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
    const entry = (bin as string | undefined) ?? pkg.main ?? 'index.js';
    start = { cmd: 'node', args: [entry] };
  }

  return { kind: 'node', setup, start };
}

/**
 * ponytail: pyproject.toml is read with a regex, not a TOML parser — we only
 * need the `[project.scripts]` entry point names. Add a TOML dependency if
 * anything else in that file ever matters.
 */
function pyprojectScripts(dir: string): string[] {
  try {
    const toml = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf-8');
    const section = toml.match(/\[project\.scripts\]([\s\S]*?)(?:\n\[|$)/);
    if (!section) return [];
    return [...section[1]!.matchAll(/^\s*["']?([A-Za-z0-9._-]+)["']?\s*=/gm)].map(m => m[1]!);
  } catch {
    return [];
  }
}

function planPython(dir: string): ProjectPlan | null {
  const hasPyproject = has(dir, 'pyproject.toml');
  const hasRequirements = has(dir, 'requirements.txt');
  if (!hasPyproject && !hasRequirements) return null;

  const setup: Cmd[] = [];
  let runner: Cmd;

  if (hasPyproject) {
    // uv reads pyproject directly and manages its own venv
    setup.push({ cmd: 'uv', args: ['sync'] });
    runner = { cmd: 'uv', args: ['run'] };
  } else {
    setup.push({ cmd: 'pip', args: ['install', '-r', 'requirements.txt'] });
    runner = { cmd: 'python', args: [] };
  }

  const scripts = pyprojectScripts(dir);
  if (scripts.length > 0) {
    return { kind: 'python', setup, start: { cmd: runner.cmd, args: [...runner.args, scripts[0]!] } };
  }

  const entry = ['main.py', 'server.py', 'app.py', '__main__.py'].find(f => has(dir, f));
  if (entry) {
    const args = runner.cmd === 'uv' ? [...runner.args, 'python', entry] : [entry];
    return { kind: 'python', setup, start: { cmd: runner.cmd, args } };
  }

  return null;
}

function planDocker(dir: string, port?: number): ProjectPlan | null {
  if (!has(dir, 'Dockerfile')) return null;
  const tag = `mcp-${path.basename(dir).replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()}`;
  const runArgs = ['run', '-i', '--rm'];
  if (port) runArgs.push('-p', `${port}:${port}`);
  runArgs.push(tag);
  return {
    kind: 'docker',
    setup: [{ cmd: 'docker', args: ['build', '-t', tag, '.'] }],
    start: { cmd: 'docker', args: runArgs },
  };
}

/**
 * Work out how to install and run a cloned MCP repo.
 * Node first: an MCP with both package.json and a Dockerfile is faster to run
 * directly than through a container build.
 */
export function detectProject(dir: string, port?: number): ProjectPlan | null {
  return planNode(dir) ?? planPython(dir) ?? planDocker(dir, port);
}

export class ProvisionService {
  // The runtime singleton is built in services/index.ts; taking it here keeps
  // this module out of that import cycle.
  constructor(private readonly runtime: RuntimeService) {}

  /**
   * Clone the repo, install its dependencies, build it, then point the instance
   * at the resulting start command. Runs in the background: cloning plus
   * `npm install` plus a build is minutes of work, far past an HTTP request.
   *
   * The code runs on this machine and stays on disk under REPOS_DIR, so it can
   * be read and audited before or after the fact.
   */
  async provision(
    instanceId: string,
    repoUrl: string,
    serverName: string,
    port?: number,
    subfolder?: string,
  ): Promise<void> {
    const emit = (step: string) => {
      console.log(`[Provision] ${serverName}: ${step}`);
      runtimeEventBus.emitRuntime('instance:status', {
        id: instanceId,
        status: 'provisioning',
        last_error: step,
      });
    };

    try {
      emit('cloning repository');
      const cloned = await gitService.cloneRepo(repoUrl, serverName);

      // The catalog points at a monorepo subdirectory for plenty of MCPs.
      const dir = subfolder ? path.join(cloned, subfolder) : cloned;
      if (!fs.existsSync(dir)) {
        throw new Error(`Repository has no "${subfolder}" directory`);
      }

      const plan = detectProject(dir, port);
      if (!plan) {
        throw new Error(
          'Cloned the repo but found no package.json, pyproject.toml, requirements.txt or Dockerfile to build from'
        );
      }

      const adapted = await this.adaptToMachine(plan);

      for (const step of adapted.setup) {
        emit(`${step.cmd} ${step.args.join(' ')}`);
        await this.run(step, dir);
      }

      this.runtime.updateInstance(instanceId, {
        exec_cmd: adapted.start.cmd,
        exec_args: adapted.start.args,
        cwd: dir,
      });
      this.runtime.setProvisioned(instanceId);
      console.log(`[Provision] ${serverName}: ready — ${adapted.start.cmd} ${adapted.start.args.join(' ')}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Provisioning failed';
      console.error(`[Provision] ${serverName}: failed —`, message);
      this.runtime.setProvisionFailed(instanceId, message);
    }
  }

  /**
   * Rewrite a plan for the tools this machine actually has. The catalog says
   * nothing about what is installed here, and a missing `yarn` should not stop
   * an install npm can do just as well. Setup and start are adapted together —
   * installing with pip but starting with `uv run` would fail at start.
   */
  private async adaptToMachine(plan: ProjectPlan): Promise<ProjectPlan> {
    const setup: Cmd[] = [];

    for (const step of plan.setup) {
      if (await this.isInstalled(step.cmd)) {
        setup.push(step);
        continue;
      }
      if (step.cmd === 'pnpm' || step.cmd === 'yarn') {
        console.warn(`[Provision] ${step.cmd} is not installed, using npm install`);
        setup.push({ cmd: 'npm', args: ['install'] });
        continue;
      }
      if (step.cmd === 'uv') {
        console.warn('[Provision] uv is not installed, using pip');
        setup.push({ cmd: 'python', args: ['-m', 'pip', 'install', '.'] });
        continue;
      }
      if (step.cmd === 'pip') {
        setup.push({ cmd: 'python', args: ['-m', 'pip', ...step.args] });
        continue;
      }
      throw new Error(`\`${step.cmd}\` is not installed on this machine, so this MCP cannot be built here`);
    }

    let start = plan.start;
    if (start.cmd === 'uv' && !(await this.isInstalled('uv'))) {
      // `uv run x` -> pip put the console script `x` on PATH
      // `uv run python f.py` -> just run python
      const args = start.args.slice(1);
      start = args[0] === 'python'
        ? { cmd: 'python', args: args.slice(1) }
        : { cmd: args[0]!, args: args.slice(1) };
    }
    if (!(await this.isInstalled(start.cmd))) {
      throw new Error(`\`${start.cmd}\` is not installed on this machine, so this MCP cannot run here`);
    }

    return { ...plan, setup, start };
  }

  private readonly toolCache = new Map<string, boolean>();

  private async isInstalled(cmd: string): Promise<boolean> {
    if (this.toolCache.has(cmd)) return this.toolCache.get(cmd)!;
    let ok = true;
    try {
      await execAsync(`${cmd} --version`, { timeout: 15_000 });
    } catch {
      ok = false;
    }
    this.toolCache.set(cmd, ok);
    return ok;
  }

  private async run(step: Cmd, cwd: string): Promise<void> {
    const command = `${step.cmd} ${step.args.join(' ')}`;
    try {
      // ponytail: 10 minutes covers a cold npm install or docker build.
      await execAsync(command, { cwd, timeout: 600_000, maxBuffer: 10 * 1024 * 1024 });
    } catch (err: any) {
      // Tools split their output: npm puts warnings on stderr and the real
      // failure on stdout. Taking only one of them hides the actual cause.
      const detail = [err.stdout, err.stderr, err.message]
        .map((part: unknown) => (part ?? '').toString().trim())
        .filter(Boolean)
        .join('\n')
        .slice(-2000);
      throw new Error(`\`${command}\` failed:\n${detail}`);
    }
  }
}

// ── self-check: npx tsx apps/runtime/src/services/provision.service.ts ──
if (process.argv[1]?.endsWith('provision.service.ts')) {
  const os = await import('node:os');
  const eq = (got: unknown, want: unknown, label: string): void => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) throw new Error(`${label}: got ${a}, want ${b}`);
  };

  const fixture = (files: Record<string, string>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-provision-'));
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
  };

  // TypeScript MCP with a lockfile and a build step
  let plan = detectProject(fixture({
    'package.json': JSON.stringify({ scripts: { build: 'tsc', start: 'node dist/index.js' } }),
    'package-lock.json': '{}',
  }))!;
  eq(plan.kind, 'node', 'node kind');
  eq(plan.setup, [{ cmd: 'npm', args: ['ci'] }, { cmd: 'npm', args: ['run', 'build'] }], 'lockfile -> npm ci, then build');
  eq(plan.start, { cmd: 'npm', args: ['start'] }, 'npm start');

  // No lockfile, no start script — fall back to the bin entry
  plan = detectProject(fixture({
    'package.json': JSON.stringify({ bin: { 'my-mcp': 'dist/cli.js' } }),
  }))!;
  eq(plan.setup, [{ cmd: 'npm', args: ['install'] }], 'no lockfile -> npm install');
  eq(plan.start, { cmd: 'node', args: ['dist/cli.js'] }, 'bin entry');

  // pnpm is picked over npm when its lockfile is there
  plan = detectProject(fixture({
    'package.json': JSON.stringify({ main: 'index.js' }),
    'pnpm-lock.yaml': '',
  }))!;
  eq(plan.setup, [{ cmd: 'pnpm', args: ['install'] }], 'pnpm lockfile');
  eq(plan.start, { cmd: 'node', args: ['index.js'] }, 'main entry');

  // Python with a declared entry point
  plan = detectProject(fixture({
    'pyproject.toml': '[project]\nname = "airflow-mcp"\n\n[project.scripts]\nairflow-mcp-server = "airflow_mcp.__main__:main"\n',
  }))!;
  eq(plan.kind, 'python', 'python kind');
  eq(plan.setup, [{ cmd: 'uv', args: ['sync'] }], 'uv sync');
  eq(plan.start, { cmd: 'uv', args: ['run', 'airflow-mcp-server'] }, 'declared script');

  // Python with no entry point declared — fall back to a known filename
  plan = detectProject(fixture({
    'pyproject.toml': '[project]\nname = "x"\n',
    'server.py': '',
  }))!;
  eq(plan.start, { cmd: 'uv', args: ['run', 'python', 'server.py'] }, 'server.py fallback');

  // requirements.txt only
  plan = detectProject(fixture({ 'requirements.txt': 'mcp\n', 'main.py': '' }))!;
  eq(plan.setup, [{ cmd: 'pip', args: ['install', '-r', 'requirements.txt'] }], 'pip install');
  eq(plan.start, { cmd: 'python', args: ['main.py'] }, 'python main.py');

  // Docker: the image has to be built before it can be run
  plan = detectProject(fixture({ Dockerfile: 'FROM node:22\n' }), 8080)!;
  eq(plan.kind, 'docker', 'docker kind');
  eq(plan.setup[0]!.args.slice(0, 2), ['build', '-t'], 'docker build first');
  eq(plan.start.args.includes('-p'), true, 'port published');

  // Nothing recognisable
  eq(detectProject(fixture({ 'README.md': '# hi' })), null, 'unknown project');

  console.log('provision: all checks passed');
}
