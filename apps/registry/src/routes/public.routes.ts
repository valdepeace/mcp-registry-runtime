import { Router, Request, Response } from 'express';
import { databaseService } from '../services/index.js';
import { validateQuery } from '../middleware/index.js';
import {
  ListServersQuerySchema,
  ListSkillsQuerySchema,
  ListAgentsQuerySchema,
  type ServerCategory,
} from '@mcp/types';
import type { SkillCategory, AgentCategory, SkillFormat, AgentType } from '@mcp/types';

const router = Router();

type TransportType = 'stdio' | 'streamable-http' | 'sse';

/**
 * GET /v0.1/servers
 * List all MCP servers with optional filters
 */
router.get(
  '/servers',
  validateQuery(ListServersQuerySchema),
  (req: Request, res: Response) => {
    const query = (req as any).validatedQuery || req.query as {
      cursor?: string;
      limit?: number;
      search?: string;
      transport_type?: TransportType;
      source?: 'registry' | 'private' | 'azure-devops' | 'all';
      origin?: string;
      category?: ServerCategory;
      tags?: string;
      verified?: boolean;
      featured?: boolean;
      vendor_official?: boolean;
    };

    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const limit = query.limit ?? 50;

    const result = databaseService.queryServers({
      search: query.search,
      transportType: query.transport_type,
      source: query.source,
      origin: query.origin,
      category: query.category,
      tags: query.tags,
      verified: query.verified,
      featured: query.featured,
      vendorOfficial: query.vendor_official,
      limit,
      offset,
    });

    const nextOffset = offset + result.servers.length;
    const hasMore = nextOffset < result.total;

    res.json({
      servers: result.servers,
      metadata: {
        count: result.servers.length,
        total: result.total,
        nextCursor: hasMore ? nextOffset.toString() : undefined,
      },
    });
    return;
  }
);

/**
 * GET /v0.1/servers/:serverName/versions
 * List all versions of a server
 */
router.get('/servers/:serverName/versions', (req: Request, res: Response) => {
  const serverName = decodeURIComponent(req.params.serverName as string);
  const versions = databaseService.getServerVersions(serverName);

  if (versions.length === 0) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  res.json({
    servers: versions,
    metadata: {
      count: versions.length,
    },
  });
  return;
});

/**
 * GET /v0.1/servers/:serverName/versions/:version
 * Get specific version of a server
 */
router.get('/servers/:serverName/versions/:version', (req: Request, res: Response) => {
  const serverName = decodeURIComponent(req.params.serverName as string);
  const version = decodeURIComponent(req.params.version as string);

  let server: ReturnType<typeof databaseService.getServer>;
  if (version === 'latest') {
    server = databaseService.getLatestServer(serverName);
  } else {
    server = databaseService.getServer(serverName, version);
  }

  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }

  res.json(server);
  return;
});

/**
 * GET /v0.1/transports
 * Get list of available transport types (convenience endpoint)
 */
router.get('/transports', (_req: Request, res: Response) => {
  res.json({
    transports: ['stdio', 'streamable-http', 'sse'],
    description: {
      stdio: 'Standard input/output transport for local processes',
      'streamable-http': 'HTTP-based streaming transport',
      sse: 'Server-Sent Events transport',
    },
  });
  return;
});

/**
 * GET /v0.1/skills
 * List all skills with optional filters
 */
router.get(
  '/skills',
  validateQuery(ListSkillsQuerySchema),
  (req: Request, res: Response) => {
    const query = (req as any).validatedQuery || req.query as {
      cursor?: string;
      limit?: number;
      search?: string;
      category?: SkillCategory;
      tags?: string;
      verified?: boolean;
      featured?: boolean;
      format?: SkillFormat;
      source?: 'registry' | 'private' | 'all';
      provider_name?: string;
    };

    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const limit = query.limit ?? 50;

    const result = databaseService.querySkills({
      search: query.search,
      source: query.source,
      provider_name: query.provider_name,
      category: query.category,
      tags: query.tags,
      verified: query.verified,
      featured: query.featured,
      format: query.format,
      limit,
      offset,
    });

    const nextOffset = offset + result.skills.length;
    const hasMore = nextOffset < result.total;

    res.json({
      skills: result.skills,
      metadata: {
        count: result.skills.length,
        total: result.total,
        nextCursor: hasMore ? nextOffset.toString() : undefined,
      },
    });
    return;
  }
);

/**
 * GET /v0.1/skills/:skillName/versions
 * List all versions of a skill
 */
router.get('/skills/:skillName/versions', (req: Request, res: Response) => {
  const skillName = decodeURIComponent(req.params.skillName as string);
  const versions = databaseService.getSkillVersions(skillName);

  if (versions.length === 0) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }

  res.json({
    skills: versions,
    metadata: { count: versions.length },
  });
  return;
});

/**
 * GET /v0.1/skills/:skillName/versions/:version
 * Get specific version of a skill
 */
router.get('/skills/:skillName/versions/:version', (req: Request, res: Response) => {
  const skillName = decodeURIComponent(req.params.skillName as string);
  const version = decodeURIComponent(req.params.version as string);

  let skill: ReturnType<typeof databaseService.getSkill>;
  if (version === 'latest') {
    skill = databaseService.getLatestSkill(skillName);
  } else {
    skill = databaseService.getSkill(skillName, version);
  }

  if (!skill) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }

  res.json(skill);
  return;
});

/**
 * GET /v0.1/agents
 * List all agents with optional filters
 */
router.get(
  '/agents',
  validateQuery(ListAgentsQuerySchema),
  (req: Request, res: Response) => {
    const query = (req as any).validatedQuery || req.query as {
      cursor?: string;
      limit?: number;
      search?: string;
      category?: AgentCategory;
      tags?: string;
      verified?: boolean;
      featured?: boolean;
      subagent_type?: AgentType;
      source?: 'registry' | 'private' | 'all';
    };

    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const limit = query.limit ?? 50;

    const result = databaseService.queryAgents({
      search: query.search,
      source: query.source,
      category: query.category,
      tags: query.tags,
      verified: query.verified,
      featured: query.featured,
      subagentType: query.subagent_type,
      limit,
      offset,
    });

    const nextOffset = offset + result.agents.length;
    const hasMore = nextOffset < result.total;

    res.json({
      agents: result.agents,
      metadata: {
        count: result.agents.length,
        total: result.total,
        nextCursor: hasMore ? nextOffset.toString() : undefined,
      },
    });
    return;
  }
);

/**
 * GET /v0.1/agents/:agentName/versions
 * List all versions of an agent
 */
router.get('/agents/:agentName/versions', (req: Request, res: Response) => {
  const agentName = decodeURIComponent(req.params.agentName as string);
  const versions = databaseService.getAgentVersions(agentName);

  if (versions.length === 0) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  res.json({
    agents: versions,
    metadata: { count: versions.length },
  });
  return;
});

/**
 * GET /v0.1/agents/:agentName/versions/:version
 * Get specific version of an agent
 */
router.get('/agents/:agentName/versions/:version', (req: Request, res: Response) => {
  const agentName = decodeURIComponent(req.params.agentName as string);
  const version = decodeURIComponent(req.params.version as string);

  let agent: ReturnType<typeof databaseService.getAgent>;
  if (version === 'latest') {
    agent = databaseService.getLatestAgent(agentName);
  } else {
    agent = databaseService.getAgent(agentName, version);
  }

  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  res.json(agent);
  return;
});

export default router;
