import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseService, syncService } from '../services/index.js';
import { authMiddleware, requireAdmin, validateBody, AuthenticatedRequest } from '../middleware/index.js';
import { CreateServerSchema, UpdateServerSchema, CreateSkillSchema, UpdateSkillSchema, CreateAgentSchema, UpdateAgentSchema } from '@mcp-nova/types';
import { config } from '../config/index.js';
import { z } from 'zod';
import type { Package, RemoteTransport } from '@mcp-nova/types';

const router = Router();

// Auth schemas
const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * POST /admin/login
 * Authenticate and get JWT token
 */
router.post('/login', validateBody(LoginSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { username, password } = req.body;

  const user = databaseService.getUser(username);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as unknown as jwt.SignOptions['expiresIn'] }
  );

  res.json({ token, expiresIn: config.jwtExpiresIn });
  return;
});

// All routes below require authentication
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /admin/me
 * Get current user info
 */
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
  return;
});

/**
 * GET /admin/sync/status
 * Get sync status
 */
router.get('/sync/status', (_req: AuthenticatedRequest, res: Response) => {
  res.json(syncService.getStatus());
  return;
});

/**
 * POST /admin/sync/trigger
 * Trigger manual sync
 */
router.post('/sync/trigger', async (_req: AuthenticatedRequest, res: Response) => {
  syncService.sync().catch(err => console.error('[Admin] Manual sync failed:', err));
  res.json({ message: 'Sync triggered', status: 'syncing' });
  return;
});

/**
 * POST /admin/servers
 * Create a new server (private or azure-devops)
 */
router.post(
  '/servers',
  validateBody(CreateServerSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const { source = 'private', ...serverDetail } = req.body;

    const existing = databaseService.getServer(serverDetail.name, serverDetail.version);
    if (existing) {
      res.status(409).json({ error: 'Server with this name and version already exists' });
      return;
    }

    const serverResponse = {
      server: serverDetail,
      _meta: {
        'io.modelcontextprotocol.registry/private': {
          createdBy: req.user?.username,
          createdAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertServer(serverResponse, source);

    res.status(201).json({ ...serverResponse, source });
    return;
  }
);

/**
 * PUT /admin/servers/:serverName/versions/:version
 * Update a private server
 */
router.put(
  '/servers/:serverName/versions/:version',
  validateBody(UpdateServerSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const serverName = decodeURIComponent(req.params.serverName as string);
    const version = decodeURIComponent(req.params.version as string);
    const updates = req.body;

    const existing = databaseService.getServer(serverName, version);
    if (!existing) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const storedSource = existing.source;
    if (storedSource === 'registry') {
      res.status(403).json({ error: 'Cannot modify registry servers' });
      return;
    }

    const updatedServer = {
      server: { ...existing.server, ...updates, name: serverName, version },
      _meta: {
        ...existing._meta,
        'io.modelcontextprotocol.registry/private': {
          ...(existing._meta?.['io.modelcontextprotocol.registry/private'] as Record<string, unknown> || {}),
          updatedBy: req.user?.username,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertServer(updatedServer, 'private');

    res.json(updatedServer);
    return;
  }
);

/**
 * DELETE /admin/servers/:serverName/versions/:version
 * Delete a specific version of a private server
 */
router.delete('/servers/:serverName/versions/:version', (req: AuthenticatedRequest, res: Response) => {
  const serverName = decodeURIComponent(req.params.serverName as string);
  const version = decodeURIComponent(req.params.version as string);

  const deleted = databaseService.deleteServer(serverName, version);
  if (!deleted) {
    res.status(404).json({ error: 'Server not found or is not a private server' });
    return;
  }

  res.json({ message: 'Server deleted successfully' });
  return;
});

/**
 * DELETE /admin/servers/:serverName
 * Delete all versions of a private server
 */
router.delete('/servers/:serverName', (req: AuthenticatedRequest, res: Response) => {
  const serverName = decodeURIComponent(req.params.serverName as string);

  const deletedCount = databaseService.deleteAllServerVersions(serverName);
  if (deletedCount === 0) {
    res.status(404).json({ error: 'Server not found or has no private versions' });
    return;
  }

  res.json({ message: `Deleted ${deletedCount} version(s)` });
  return;
});

/**
 * GET /admin/stats
 * Get registry statistics (servers, skills, agents)
 */
router.get('/stats', (_req: AuthenticatedRequest, res: Response) => {
  const allServers = databaseService.queryServers({ limit: 10000 });
  const registryServers = databaseService.queryServers({ source: 'registry', limit: 10000 });
  const privateServers = databaseService.queryServers({ source: 'private', limit: 10000 });
  const allSkills = databaseService.querySkills({ limit: 10000 });
  const allAgents = databaseService.queryAgents({ limit: 10000 });

  const transportCounts: Record<string, number> = {
    stdio: 0,
    'streamable-http': 0,
    sse: 0,
  };

  allServers.servers.forEach(s => {
    s.server.packages?.forEach((p: Package) => {
      if (p.transport?.type && p.transport.type in transportCounts) {
        transportCounts[p.transport.type]++;
      }
    });
    s.server.remotes?.forEach((r: RemoteTransport) => {
      if (r.type && r.type in transportCounts) {
        transportCounts[r.type]++;
      }
    });
  });

  res.json({
    servers: {
      total: allServers.total,
      registry: registryServers.total,
      private: privateServers.total,
      byTransport: transportCounts,
    },
    skills: {
      total: allSkills.total,
      registry: databaseService.querySkills({ source: 'registry', limit: 10000 }).total,
      private: databaseService.querySkills({ source: 'private', limit: 10000 }).total,
    },
    agents: {
      total: allAgents.total,
      registry: databaseService.queryAgents({ source: 'registry', limit: 10000 }).total,
      private: databaseService.queryAgents({ source: 'private', limit: 10000 }).total,
    },
    syncStatus: syncService.getStatus(),
  });
  return;
});

// ────────────────────────────── Skills Admin ──────────────────────────────

/**
 * POST /admin/skills
 * Create a new private skill
 */
router.post(
  '/skills',
  validateBody(CreateSkillSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const { source = 'private', ...skillDetail } = req.body;

    const existing = databaseService.getSkill(skillDetail.name, skillDetail.version);
    if (existing) {
      res.status(409).json({ error: 'Skill with this name and version already exists' });
      return;
    }

    const skillResponse = {
      skill: skillDetail,
      _meta: {
        'io.modelcontextprotocol.registry/private': {
          createdBy: req.user?.username,
          createdAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertSkill(skillResponse, source);

    res.status(201).json({ ...skillResponse, source });
    return;
  }
);

/**
 * PUT /admin/skills/:skillName/versions/:version
 * Update a private skill
 */
router.put(
  '/skills/:skillName/versions/:version',
  validateBody(UpdateSkillSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const skillName = decodeURIComponent(req.params.skillName as string);
    const version = decodeURIComponent(req.params.version as string);
    const updates = req.body;

    const existing = databaseService.getSkill(skillName, version);
    if (!existing) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    if (existing.source === 'registry') {
      res.status(403).json({ error: 'Cannot modify registry skills' });
      return;
    }

    const updatedSkill = {
      skill: { ...existing.skill, ...updates, name: skillName, version },
      _meta: {
        ...existing._meta,
        'io.modelcontextprotocol.registry/private': {
          ...(existing._meta?.['io.modelcontextprotocol.registry/private'] as Record<string, unknown> || {}),
          updatedBy: req.user?.username,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertSkill(updatedSkill, 'private');

    res.json(updatedSkill);
    return;
  }
);

/**
 * DELETE /admin/skills/:skillName/versions/:version
 * Delete a specific version of a private skill
 */
router.delete('/skills/:skillName/versions/:version', (req: AuthenticatedRequest, res: Response) => {
  const skillName = decodeURIComponent(req.params.skillName as string);
  const version = decodeURIComponent(req.params.version as string);

  const deleted = databaseService.deleteSkill(skillName, version);
  if (!deleted) {
    res.status(404).json({ error: 'Skill not found or is not a private skill' });
    return;
  }

  res.json({ message: 'Skill deleted successfully' });
  return;
});

/**
 * DELETE /admin/skills/:skillName
 * Delete all versions of a private skill
 */
router.delete('/skills/:skillName', (req: AuthenticatedRequest, res: Response) => {
  const skillName = decodeURIComponent(req.params.skillName as string);

  const deletedCount = databaseService.deleteAllSkillVersions(skillName);
  if (deletedCount === 0) {
    res.status(404).json({ error: 'Skill not found or has no private versions' });
    return;
  }

  res.json({ message: `Deleted ${deletedCount} skill version(s)` });
  return;
});

// ────────────────────────────── Agents Admin ──────────────────────────────

/**
 * POST /admin/agents
 * Create a new private agent
 */
router.post(
  '/agents',
  validateBody(CreateAgentSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const { source = 'private', ...agentDetail } = req.body;

    const existing = databaseService.getAgent(agentDetail.name, agentDetail.version);
    if (existing) {
      res.status(409).json({ error: 'Agent with this name and version already exists' });
      return;
    }

    const agentResponse = {
      agent: agentDetail,
      _meta: {
        'io.modelcontextprotocol.registry/private': {
          createdBy: req.user?.username,
          createdAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertAgent(agentResponse, source);

    res.status(201).json({ ...agentResponse, source });
    return;
  }
);

/**
 * PUT /admin/agents/:agentName/versions/:version
 * Update a private agent
 */
router.put(
  '/agents/:agentName/versions/:version',
  validateBody(UpdateAgentSchema),
  (req: AuthenticatedRequest, res: Response) => {
    const agentName = decodeURIComponent(req.params.agentName as string);
    const version = decodeURIComponent(req.params.version as string);
    const updates = req.body;

    const existing = databaseService.getAgent(agentName, version);
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (existing.source === 'registry') {
      res.status(403).json({ error: 'Cannot modify registry agents' });
      return;
    }

    const updatedAgent = {
      agent: { ...existing.agent, ...updates, name: agentName, version },
      _meta: {
        ...existing._meta,
        'io.modelcontextprotocol.registry/private': {
          ...(existing._meta?.['io.modelcontextprotocol.registry/private'] as Record<string, unknown> || {}),
          updatedBy: req.user?.username,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    databaseService.upsertAgent(updatedAgent, 'private');

    res.json(updatedAgent);
    return;
  }
);

/**
 * DELETE /admin/agents/:agentName/versions/:version
 * Delete a specific version of a private agent
 */
router.delete('/agents/:agentName/versions/:version', (req: AuthenticatedRequest, res: Response) => {
  const agentName = decodeURIComponent(req.params.agentName as string);
  const version = decodeURIComponent(req.params.version as string);

  const deleted = databaseService.deleteAgent(agentName, version);
  if (!deleted) {
    res.status(404).json({ error: 'Agent not found or is not a private agent' });
    return;
  }

  res.json({ message: 'Agent deleted successfully' });
  return;
});

/**
 * DELETE /admin/agents/:agentName
 * Delete all versions of a private agent
 */
router.delete('/agents/:agentName', (req: AuthenticatedRequest, res: Response) => {
  const agentName = decodeURIComponent(req.params.agentName as string);

  const deletedCount = databaseService.deleteAllAgentVersions(agentName);
  if (deletedCount === 0) {
    res.status(404).json({ error: 'Agent not found or has no private versions' });
    return;
  }

  res.json({ message: `Deleted ${deletedCount} agent version(s)` });
  return;
});

export default router;
