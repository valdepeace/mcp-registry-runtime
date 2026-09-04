import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runtimeService, databaseService, runtimeEventBus, mcpInspectorService, pm2Service, provisionService, detectProject, PENDING_PROVISION } from '../services/index.js';
import type { RuntimeEventName } from '../services/index.js';
import { validateBody, validateQuery } from '../middleware/index.js';
import {
  CreateRuntimeInstanceSchema,
  UpdateRuntimeInstanceSchema,
  LogsQuerySchema
} from '@mcp/types';
import type { ServerResponse } from '@mcp/types';
import { buildArgs, resolveLocalPort, type ArgSpec } from '../services/catalog-args.js';
import { config } from '../config/index.js';

const router = Router();

// Opens the OS file manager on the cloned repo's folder, for the "where is
// this code on my machine" ask. Only ever called with a path already stored
// in runtime_instances.cwd (set by git.service on clone), never raw user
// input — args array (not shell string) so nothing to inject either way.
// No-op with an error in headless environments (e.g. Docker) with no desktop.
function openInFileExplorer(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const [cmd, args] =
      platform === 'win32' ? ['explorer', [targetPath]] :
      platform === 'darwin' ? ['open', [targetPath]] :
      ['xdg-open', [targetPath]];

    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', reject);
    // explorer.exe often exits 1 even on success — resolve regardless of code,
    // only a spawn-level error (binary missing, no desktop) is a real failure.
    child.on('exit', () => resolve());
  });
}

// Lets the "from local folder" picker walk this machine's filesystem, since a
// browser can never hand back an absolute OS path on its own (see the folder
// input in CreateRuntimeForm). Directories only — this is for picking a cwd,
// not a file explorer.
router.get('/browse-dir', (req: Request, res: Response) => {
  const requested = (req.query.path as string | undefined) || os.homedir();

  if (!path.isAbsolute(requested)) {
    res.status(400).json({ error: 'path must be absolute' });
    return;
  }
  if (!fs.existsSync(requested) || !fs.statSync(requested).isDirectory()) {
    res.status(400).json({ error: `Not a directory: ${requested}` });
    return;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(requested, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    res.status(403).json({ error: 'Cannot read that folder' });
    return;
  }

  const parent = path.dirname(requested);
  res.json({ path: requested, parent: parent === requested ? null : parent, entries });
  return;
});

router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  const events: RuntimeEventName[] = [
    'instance:status',
    'instance:health',
    'instance:created',
    'instance:deleted',
    'instance:updated',
    'runtime:metrics',
  ];

  const listeners = events.map(eventName => {
    const listener = (data: unknown) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    runtimeEventBus.on(eventName, listener);
    return { eventName, listener };
  });

  const cleanup = () => {
    clearInterval(heartbeat);
    for (const { eventName, listener } of listeners) {
      runtimeEventBus.off(eventName, listener);
    }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  return;
});

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const [pm2Processes, instances] = await Promise.all([
      pm2Service.listMCPProcesses(),
      Promise.resolve(runtimeService.listInstances()),
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

    res.json({ metrics });
    return;
  } catch (err) {
    console.error('[Runtime] Error fetching metrics:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
    return;
  }
});

router.get('/instances', async (_req: Request, res: Response) => {
  try {
    await runtimeService.syncStatusFromPM2();
    const instances = runtimeService.listInstances();
    res.json({ instances });
    return;
  } catch (err) {
    console.error('[Runtime] Error listing instances:', err);
    res.status(500).json({ error: 'Failed to list instances' });
    return;
  }
});

router.post(
  '/instances',
  validateBody(CreateRuntimeInstanceSchema),
  (req: Request, res: Response) => {
    try {
      const instance = runtimeService.createInstance(req.body);
      res.status(201).json({ instance });
      return;
    } catch (err) {
      console.error('[Runtime] Error creating instance:', err);
      res.status(500).json({ error: 'Failed to create instance' });
      return;
    }
  }
);

router.post('/instances/from-catalog', async (req: Request, res: Response) => {
  try {
    const { server_name, version, clone_repo, auto_start, dry_run } = req.body as {
      server_name: string;
      version?: string;
      clone_repo?: boolean;
      auto_start?: boolean;
      dry_run?: boolean;
    };

    if (!server_name) {
      res.status(400).json({ error: 'server_name required' });
      return;
    }

    // Fetch server info from registry backend
    const ver = version || 'latest';
    const registryResponse = await fetch(
      `${config.registryUrl}/v0.1/servers/${encodeURIComponent(server_name)}/versions/${encodeURIComponent(ver)}`
    );

    if (!registryResponse.ok) {
      res.status(404).json({ error: 'Server not found in catalog' });
      return;
    }

    const server = await registryResponse.json() as ServerResponse;

    const cwd: string | undefined = undefined;
    const repoUrl = server.server.repository?.url;
    // Plenty of MCPs live in a subdirectory of a monorepo.
    const subfolder = server.server.repository?.subfolder;

    let exec_cmd: string;
    let exec_args: string[] = [];
    let env_json: Record<string, string> = {};
    let port: number | undefined;

    const pkg = server.server.packages?.[0];
    // clone_repo means "build it from source", so it wins over the published package
    const buildFromSource = !!repoUrl && (!pkg || !!clone_repo);

    if (pkg && !buildFromSource) {
      const registryType = pkg.registryType.toLowerCase();
      const runtimeHint = pkg.runtimeHint?.toLowerCase() || '';
      const runtimeArgs = buildArgs(pkg.runtimeArguments as ArgSpec[] | undefined);
      const packageArgs = buildArgs(pkg.packageArguments as ArgSpec[] | undefined);

      // MCPs that speak HTTP run locally and listen on a port — nothing is sent
      // to the vendor's hosted endpoint.
      const transportType = pkg.transport?.type;
      if (transportType === 'streamable-http' || transportType === 'sse') {
        const taken = new Set(
          runtimeService.listInstances().map(i => i.port).filter((p): p is number => !!p)
        );
        port = resolveLocalPort(
          [
            ...((pkg.runtimeArguments ?? []) as ArgSpec[]),
            ...((pkg.packageArguments ?? []) as ArgSpec[]),
          ],
          taken,
        );
      }

      if (registryType === 'npm') {
        exec_cmd = runtimeHint || 'npx';
        exec_args = [...runtimeArgs, pkg.identifier, ...packageArgs];
      } else if (registryType === 'pypi') {
        exec_cmd = runtimeHint || 'uvx';
        exec_args = [...runtimeArgs, pkg.identifier, ...packageArgs];
      } else if (registryType === 'oci' || registryType === 'docker') {
        // runtime args are docker's own flags, they go before the image
        exec_cmd = 'docker';
        exec_args = ['run', '-i', '--rm', ...runtimeArgs, pkg.identifier, ...packageArgs];
      } else {
        res.status(400).json({
          error: `Unsupported registry type: ${registryType}. Please create instance manually.`
        });
        return;
      }

      if (pkg.environmentVariables) {
        for (const envVar of pkg.environmentVariables) {
          if (envVar.default) {
            env_json[envVar.name] = envVar.default;
          }
        }
      }
    } else if (buildFromSource && repoUrl) {
      // Build from source, but there is source: clone it, install its
      // dependencies and build it here, then let PM2 run the result. The code
      // executes on this machine and stays on disk, so it can be audited.
      if (dry_run) {
        res.json({
          detected: {
            exec_cmd: '',
            exec_args: [],
            env_json: {},
            port,
            provision: { repository: repoUrl, subfolder },
          },
        });
        return;
      }

      const instance = runtimeService.createInstance(
        {
          server_name: server.server.name,
          version: server.server.version,
          exec_cmd: PENDING_PROVISION,
          port,
        } as any,
        'provisioning',
      );

      // Minutes of work — do not hold the request open for it.
      void provisionService
        .provision(instance.id, repoUrl, server.server.name, port, subfolder)
        .then(async () => {
          if (!auto_start) return;
          const ready = runtimeService.getInstance(instance.id);
          if (ready?.status === 'stopped') await runtimeService.startInstance(instance.id);
        });

      res.status(202).json({
        instance,
        message: 'Cloning the repository and installing dependencies. Watch the instance for progress.',
      });
      return;
    } else {
      res.status(400).json({
        error: 'This MCP has no package and no repository, so there is nothing to run locally',
      });
      return;
    }

    const input: Record<string, unknown> = {
      server_name: server.server.name,
      version: server.server.version,
      exec_cmd,
      exec_args,
      env_json: Object.keys(env_json).length > 0 ? env_json : undefined,
    };

    if (cwd) {
      input.cwd = cwd;
    }
    if (port) {
      input.port = port;
    }

    // dry_run lets the UI show the detected config for review before creating.
    if (dry_run) {
      res.json({ detected: { exec_cmd, exec_args, env_json, cwd, port } });
      return;
    }

    const instance = runtimeService.createInstance(input as any);

    if (auto_start) {
      try {
        await runtimeService.startInstance(instance.id);
      } catch (startErr) {
        console.error('[Runtime] Auto-start failed:', startErr);
      }
      const updated = runtimeService.getInstance(instance.id);

      res.status(201).json({
        instance: updated,
        detected: { exec_cmd, exec_args, env_json, cwd, port },
        message: cwd
          ? 'Repo cloned, instance created and started.'
          : 'Instance created and started.',
      });
      return;
    }

    res.status(201).json({
      instance,
      detected: { exec_cmd, exec_args, env_json, cwd, port },
      message: cwd
        ? 'Repo cloned, instance created. Review settings before starting.'
        : 'Instance created from catalog. Review and adjust settings before starting.'
    });
    return;
  } catch (err) {
    console.error('[Runtime] Error creating from catalog:', err);
    res.status(500).json({ error: 'Failed to create from catalog' });
    return;
  }
});

/**
 * Run an MCP straight from a folder already on this machine — a local dev
 * checkout, not tied to any catalog entry. No clone: PM2 runs it in place, so
 * editing the folder and hitting Restart in the dashboard picks up the change
 * immediately.
 */
router.post('/instances/from-local-folder', async (req: Request, res: Response) => {
  try {
    const { path: dir, server_name, version, port, auto_start, dry_run } = req.body as {
      path: string;
      server_name?: string;
      version?: string;
      port?: number;
      auto_start?: boolean;
      dry_run?: boolean;
    };

    if (!dir) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    if (!path.isAbsolute(dir)) {
      res.status(400).json({ error: 'path must be absolute' });
      return;
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      res.status(400).json({ error: `Not a directory: ${dir}` });
      return;
    }

    // No catalog entry to name this from — derive one from the folder itself,
    // e.g. "local/my-mcp-server". Editable afterwards like anything else.
    const folderName = path.basename(dir).replace(/[^a-zA-Z0-9._-]/g, '-') || 'server';
    const pkg = fs.existsSync(path.join(dir, 'package.json'))
      ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
      : null;

    const resolvedServerName = server_name || `local/${folderName}`;
    const resolvedVersion = version || pkg?.version || '0.0.0-local';

    if (dry_run) {
      const plan = detectProject(dir, port);
      res.json({
        detected: plan
          ? { exec_cmd: plan.start.cmd, exec_args: plan.start.args, env_json: {}, cwd: dir, port }
          : { exec_cmd: '', exec_args: [], env_json: {}, cwd: dir, port },
      });
      return;
    }

    const instance = runtimeService.createInstance(
      {
        server_name: resolvedServerName,
        version: resolvedVersion,
        exec_cmd: PENDING_PROVISION,
        port,
      } as any,
      'provisioning',
    );

    void provisionService
      .provisionLocal(instance.id, dir, resolvedServerName, port)
      .then(async () => {
        if (!auto_start) return;
        const ready = runtimeService.getInstance(instance.id);
        if (ready?.status === 'stopped') await runtimeService.startInstance(instance.id);
      });

    res.status(202).json({
      instance,
      message: 'Installing dependencies and building in place. Watch the instance for progress.',
    });
    return;
  } catch (err) {
    console.error('[Runtime] Error creating from local folder:', err);
    res.status(500).json({ error: 'Failed to create from local folder' });
    return;
  }
});

router.get('/instances/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await runtimeService.syncStatusFromPM2(id);
    const instance = runtimeService.getInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ instance });
    return;
  } catch (err) {
    console.error('[Runtime] Error getting instance:', err);
    res.status(500).json({ error: 'Failed to get instance' });
    return;
  }
});

router.put(
  '/instances/:id',
  validateBody(UpdateRuntimeInstanceSchema),
  (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const instance = runtimeService.updateInstance(id, req.body);

      if (!instance) {
        res.status(404).json({ error: 'Instance not found' });
        return;
      }

      res.json({ instance });
      return;
    } catch (err) {
      console.error('[Runtime] Error updating instance:', err);
      res.status(500).json({ error: 'Failed to update instance' });
      return;
    }
  }
);

router.delete('/instances/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await runtimeService.deleteInstance(id);

    if (!deleted) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ message: 'Instance deleted' });
    return;
  } catch (err) {
    console.error('[Runtime] Error deleting instance:', err);
    res.status(500).json({ error: 'Failed to delete instance' });
    return;
  }
});

router.post('/instances/:id/open-folder', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = runtimeService.getInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }
    if (!instance.cwd) {
      res.status(400).json({ error: 'This instance has no cloned code on disk (npx-based server)' });
      return;
    }

    try {
      await openInFileExplorer(instance.cwd);
    } catch (err) {
      // Most likely: running headless (e.g. in Docker) with no desktop to open a
      // window on. Not fatal — the path is still shown in the UI to copy by hand.
      res.status(422).json({ error: `Could not open a file explorer window: ${(err as Error).message}` });
      return;
    }

    res.json({ message: 'Opened', path: instance.cwd });
    return;
  } catch (err) {
    console.error('[Runtime] Error opening instance folder:', err);
    res.status(500).json({ error: 'Failed to open folder' });
    return;
  }
});

router.post('/instances/:id/start', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = await runtimeService.startInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ instance });
    return;
  } catch (err) {
    console.error('[Runtime] Error starting instance:', err);
    res.status(500).json({ error: 'Failed to start instance' });
    return;
  }
});

router.post('/instances/:id/stop', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = await runtimeService.stopInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ instance });
    return;
  } catch (err) {
    console.error('[Runtime] Error stopping instance:', err);
    res.status(500).json({ error: 'Failed to stop instance' });
    return;
  }
});

router.post('/instances/:id/restart', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = await runtimeService.restartInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({ instance });
    return;
  } catch (err) {
    console.error('[Runtime] Error restarting instance:', err);
    res.status(500).json({ error: 'Failed to restart instance' });
    return;
  }
});

router.get('/instances/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await runtimeService.syncStatusFromPM2(id);
    const instance = runtimeService.getInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    res.json({
      id: instance.id,
      pm2_name: instance.pm2_name,
      status: instance.status,
      pid: instance.pid,
      uptime_ms: instance.uptime_ms,
      restart_count: instance.restart_count,
      last_error: instance.last_error,
    });
    return;
  } catch (err) {
    console.error('[Runtime] Error getting status:', err);
    res.status(500).json({ error: 'Failed to get status' });
    return;
  }
});

router.get(
  '/instances/:id/logs',
  validateQuery(LogsQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const query = (req as any).validatedQuery || req.query;
      const tail = query.tail ?? 200;

      const instance = runtimeService.getInstance(id);
      if (!instance) {
        res.status(404).json({ error: 'Instance not found' });
        return;
      }

      const logs = await runtimeService.getInstanceLogs(id, tail);
      res.json({ logs });
      return;
    } catch (err) {
      console.error('[Runtime] Error getting logs:', err);
      res.status(500).json({ error: 'Failed to get logs' });
      return;
    }
  }
);

router.post('/sync', async (_req: Request, res: Response) => {
  try {
    await runtimeService.syncStatusFromPM2();
    const instances = runtimeService.listInstances();
    res.json({ message: 'Sync complete', instances });
    return;
  } catch (err) {
    console.error('[Runtime] Error syncing:', err);
    res.status(500).json({ error: 'Failed to sync' });
    return;
  }
});

router.get('/instances/:id/health', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const instance = runtimeService.getInstance(id);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    if (!instance.health_url) {
      res.json({
        id: instance.id,
        health_status: 'unknown',
        message: 'No health_url configured'
      });
      return;
    }

    const healthStatus = await runtimeService.checkHealth(id);
    const updatedInstance = runtimeService.getInstance(id);

    res.json({
      id: instance.id,
      health_url: instance.health_url,
      health_status: healthStatus,
      last_health_check: updatedInstance?.last_health_check,
      status: updatedInstance?.status,
    });
    return;
  } catch (err) {
    console.error('[Runtime] Error checking health:', err);
    res.status(500).json({ error: 'Failed to check health' });
    return;
  }
});

router.post('/health', async (_req: Request, res: Response) => {
  try {
    await runtimeService.checkAllHealth();
    const instances = runtimeService.listInstances();
    const healthResults = instances
      .filter(i => i.status === 'online' || i.status === 'degraded')
      .map(i => ({
        id: i.id,
        pm2_name: i.pm2_name,
        status: i.status,
        health_status: i.health_status,
        last_health_check: i.last_health_check,
      }));

    res.json({ message: 'Health check complete', results: healthResults });
    return;
  } catch (err) {
    console.error('[Runtime] Error checking health:', err);
    res.status(500).json({ error: 'Failed to check health' });
    return;
  }
});

router.post('/bulk/start', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids || !Array.isArray(ids)) {
      res.status(400).json({ error: 'ids array required' });
      return;
    }

    const results = await Promise.allSettled(
      ids.map(id => runtimeService.startInstance(id))
    );

    const summary = results.map((r, i) => ({
      id: ids[i],
      success: r.status === 'fulfilled',
      error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }));

    res.json({ message: 'Bulk start complete', results: summary });
    return;
  } catch (err) {
    console.error('[Runtime] Error bulk start:', err);
    res.status(500).json({ error: 'Failed to bulk start' });
    return;
  }
});

router.post('/bulk/stop', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids || !Array.isArray(ids)) {
      res.status(400).json({ error: 'ids array required' });
      return;
    }

    const results = await Promise.allSettled(
      ids.map(id => runtimeService.stopInstance(id))
    );

    const summary = results.map((r, i) => ({
      id: ids[i],
      success: r.status === 'fulfilled',
      error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }));

    res.json({ message: 'Bulk stop complete', results: summary });
    return;
  } catch (err) {
    console.error('[Runtime] Error bulk stop:', err);
    res.status(500).json({ error: 'Failed to bulk stop' });
    return;
  }
});

router.post('/bulk/restart', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids || !Array.isArray(ids)) {
      res.status(400).json({ error: 'ids array required' });
      return;
    }

    const results = await Promise.allSettled(
      ids.map(id => runtimeService.restartInstance(id))
    );

    const summary = results.map((r, i) => ({
      id: ids[i],
      success: r.status === 'fulfilled',
      error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }));

    res.json({ message: 'Bulk restart complete', results: summary });
    return;
  } catch (err) {
    console.error('[Runtime] Error bulk restart:', err);
    res.status(500).json({ error: 'Failed to bulk restart' });
    return;
  }
});

// ─── MCP Inspector ──────────────────────────────────────────────────────────

router.get('/instances/:id/inspect', async (req: Request, res: Response) => {
  try {
    const instance = runtimeService.getInstance(req.params.id as string);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    const capabilities = await mcpInspectorService.getCapabilities(instance);
    res.json(capabilities);
    return;
  } catch (err) {
    console.error('[Inspector] getCapabilities error:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Inspection failed' });
    return;
  }
});

router.get('/instances/:id/inspect/history', (req: Request, res: Response) => {
  try {
    const instanceId = req.params.id as string;
    const instance = runtimeService.getInstance(instanceId);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    const history = databaseService.listInspectHistory(instanceId);
    res.json({ history });
    return;
  } catch (err) {
    console.error('[Inspector] history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
    return;
  }
});

router.post('/instances/:id/inspect/tools/:name', async (req: Request, res: Response) => {
  const instanceId = req.params.id as string;
  const toolName = req.params.name as string;
  const args = (req.body as Record<string, unknown>) ?? {};
  const start = Date.now();
  try {
    const instance = runtimeService.getInstance(instanceId);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    const result = await mcpInspectorService.callTool(instance, toolName, args);
    databaseService.insertInspectHistory({
      instance_id: instanceId,
      tool_name: toolName,
      args_json: JSON.stringify(args),
      result_json: JSON.stringify(result),
      status: 'success',
      duration_ms: Date.now() - start,
    });
    res.json(result);
    return;
  } catch (err) {
    databaseService.insertInspectHistory({
      instance_id: instanceId,
      tool_name: toolName,
      args_json: JSON.stringify(args),
      status: 'error',
      error: err instanceof Error ? err.message : 'Tool call failed',
      duration_ms: Date.now() - start,
    });
    console.error('[Inspector] callTool error:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Tool call failed' });
    return;
  }
});

router.post('/instances/:id/inspect/resources/read', async (req: Request, res: Response) => {
  try {
    const { uri } = req.body as { uri?: string };
    if (!uri) { res.status(400).json({ error: 'uri required' }); return; }
    const instance = runtimeService.getInstance(req.params.id as string);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    const result = await mcpInspectorService.readResource(instance, uri);
    res.json(result);
    return;
  } catch (err) {
    console.error('[Inspector] readResource error:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Resource read failed' });
    return;
  }
});

router.post('/instances/:id/inspect/prompts/:name', async (req: Request, res: Response) => {
  try {
    const instance = runtimeService.getInstance(req.params.id as string);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    const result = await mcpInspectorService.getPrompt(
      instance,
      req.params.name as string,
      (req.body as Record<string, string>) ?? {}
    );
    res.json(result);
    return;
  } catch (err) {
    console.error('[Inspector] getPrompt error:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Prompt failed' });
    return;
  }
});

export default router;
