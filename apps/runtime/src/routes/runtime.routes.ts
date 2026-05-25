import { Router, Request, Response } from 'express';
import { runtimeService, databaseService, runtimeEventBus, mcpInspectorService, pm2Service, gitService } from '../services/index.js';
import type { RuntimeEventName } from '../services/index.js';
import { validateBody, validateQuery } from '../middleware/index.js';
import {
  CreateRuntimeInstanceSchema,
  UpdateRuntimeInstanceSchema,
  LogsQuerySchema
} from '@mcp-nova/types';
import type { ServerResponse } from '@mcp-nova/types';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

const router = Router();

interface DetectedCommand {
  execCmd: string;
  execArgs: string[];
}

function detectFromProject(projectDir: string): DetectedCommand | null {
  const packageJsonPath = path.join(projectDir, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.scripts?.start) {
        return { execCmd: 'npm', execArgs: ['start'] };
      }
      if (pkg.main) {
        return { execCmd: 'node', execArgs: [pkg.main] };
      }
    } catch {
      // invalid package.json
    }
  }

  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    return { execCmd: 'uv', execArgs: ['run', 'server.py'] };
  }

  const dockerfilePath = path.join(projectDir, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    const imageName = path.basename(projectDir).replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    return { execCmd: 'docker', execArgs: ['run', '-i', '--rm', imageName] };
  }

  return null;
}

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
    const { server_name, version, clone_repo, auto_start } = req.body as {
      server_name: string;
      version?: string;
      clone_repo?: boolean;
      auto_start?: boolean;
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

    let cwd: string | undefined;

    if (clone_repo && server.server.repository?.url) {
      const targetDir = await gitService.cloneRepo(server.server.repository.url, server.server.name);
      cwd = targetDir;
    }

    let exec_cmd: string;
    let exec_args: string[] = [];
    let env_json: Record<string, string> = {};

    const pkg = server.server.packages?.[0];

    if (pkg) {
      // Auto-detect from package definition (existing logic)
      const registryType = pkg.registryType.toLowerCase();
      const runtimeHint = pkg.runtimeHint?.toLowerCase() || '';

      if (registryType === 'npm') {
        exec_cmd = runtimeHint || 'npx';
        exec_args = [pkg.identifier];
      } else if (registryType === 'pypi') {
        exec_cmd = runtimeHint || 'uvx';
        exec_args = [pkg.identifier];
      } else if (registryType === 'oci' || registryType === 'docker') {
        exec_cmd = 'docker';
        exec_args = ['run', '-i', '--rm', pkg.identifier];
      } else {
        res.status(400).json({
          error: `Unsupported registry type: ${registryType}. Please create instance manually.`
        });
        return;
      }

      if (pkg.packageArguments) {
        for (const arg of pkg.packageArguments) {
          if (arg.type === 'positional' && 'valueHint' in arg && arg.valueHint) {
            exec_args.push(arg.valueHint);
          } else if (arg.type === 'named' && 'name' in arg && arg.name) {
            exec_args.push(arg.name as string);
          }
        }
      }

      if (pkg.environmentVariables) {
        for (const envVar of pkg.environmentVariables) {
          if (envVar.default) {
            env_json[envVar.name] = envVar.default;
          }
        }
      }
    } else if (clone_repo && cwd) {
      // No packages — try to auto-detect from cloned project files
      const detected = detectFromProject(cwd);
      if (!detected) {
        res.status(400).json({
          error: 'Could not auto-detect runtime from cloned project. Create instance manually with the correct exec command.',
          cwd
        });
        return;
      }
      exec_cmd = detected.execCmd;
      exec_args = detected.execArgs;
    } else {
      res.status(400).json({ error: 'Server has no packages defined, cannot auto-detect runtime' });
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
        detected: { exec_cmd, exec_args, env_json, cwd },
        message: cwd
          ? 'Repo cloned, instance created and started.'
          : 'Instance created and started.',
      });
      return;
    }

    res.status(201).json({
      instance,
      detected: { exec_cmd, exec_args, env_json, cwd },
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
