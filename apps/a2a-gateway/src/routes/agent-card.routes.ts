import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';

const router = Router();

/**
 * The manifest another agent reads before ever sending a task. Served
 * unauthenticated, by convention, at the well-known path.
 *
 * capabilities.streaming is honestly false for now: request_mcp waits for
 * provisioning inline (bounded) rather than reporting progress over
 * message/stream — see the design doc's "Open questions" for the deferred
 * streaming path.
 */
router.get('/.well-known/agent-card.json', (_req: Request, res: Response) => {
  res.json({
    name: 'mcp-registry-runtime-gateway',
    description: 'Discovers MCP servers in this host\'s catalog and provisions them on request',
    url: `${config.publicUrl}/a2a`,
    version: '1.0.0',
    capabilities: { streaming: false },
    authentication: { schemes: ['api-key'], header: 'X-Api-Key' },
    skills: [
      {
        id: 'list_catalog',
        name: 'List catalog',
        description: 'List MCP servers available in the registry, optionally filtered by a search query',
        inputSchema: { query: 'string (optional)' },
      },
      {
        id: 'list_running',
        name: 'List running instances',
        description: 'List MCP instances currently deployed on this runtime',
        inputSchema: {},
      },
      {
        id: 'request_mcp',
        name: 'Request an MCP',
        description:
          'Provision and start an MCP by exact server_name, or search by query. ' +
          'An ambiguous query returns input-required with the matching candidates instead of guessing. ' +
          'Requests for an MCP already running are routed to that shared instance.',
        inputSchema: { server_name: 'string (optional)', query: 'string (optional)', version: 'string (optional)' },
      },
      {
        id: 'get_status',
        name: 'Get instance status',
        description: 'Status, endpoint and health of a given instance',
        inputSchema: { instance_id: 'string' },
      },
    ],
  });
});

export { router as agentCardRoutes };
