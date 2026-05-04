import { Router, Response } from 'express';
import { z } from 'zod';
import {
  authMiddleware,
  requireAdmin,
  validateBody,
  AuthenticatedRequest,
} from '../middleware/index.js';
import {
  databaseService,
  agentComposerService,
  agentInvokerService,
} from '../services/index.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

const CreateInstanceSchema = z.object({
  agent_name: z.string().min(1).max(200),
  agent_version: z.string().min(1).max(255),
  exec_cmd: z.string().max(500).optional(),
  exec_args: z.array(z.string()).optional(),
  env_json: z.record(z.string()).optional(),
});

const InvokeAgentSchema = z.object({
  input: z.string().min(1),
});

/**
 * GET /admin/agent-runtime/instances
 */
router.get('/instances', (_req: AuthenticatedRequest, res: Response) => {
  const instances = databaseService.listInstances();
  res.json({ instances });
  return;
});

/**
 * POST /admin/agent-runtime/instances
 */
router.post(
  '/instances',
  validateBody(CreateInstanceSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const instance = await agentInvokerService.createInstance(req.body);
      res.status(201).json({ instance });
    } catch (err) {
      console.error('[AgentRuntime] Create instance failed:', err);
      res.status(500).json({ error: 'Failed to create agent instance' });
    }
    return;
  }
);

/**
 * GET /admin/agent-runtime/instances/:id
 */
router.get('/instances/:id', (req: AuthenticatedRequest, res: Response) => {
  const instance = databaseService.getInstance(req.params.id as string);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found' });
    return;
  }
  res.json({ instance });
  return;
});

/**
 * DELETE /admin/agent-runtime/instances/:id
 */
router.delete('/instances/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await agentInvokerService.deleteInstance(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Agent instance not found' });
      return;
    }
    res.json({ message: 'Agent instance deleted' });
  } catch (err) {
    console.error('[AgentRuntime] Delete instance failed:', err);
    res.status(500).json({ error: 'Failed to delete agent instance' });
  }
  return;
});

/**
 * POST /admin/agent-runtime/instances/:id/start
 */
router.post('/instances/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const instance = await agentInvokerService.startInstance(req.params.id as string);
    res.json({ instance });
  } catch (err) {
    console.error('[AgentRuntime] Start instance failed:', err);
    res.status(500).json({ error: 'Failed to start agent instance' });
  }
  return;
});

/**
 * POST /admin/agent-runtime/instances/:id/stop
 */
router.post('/instances/:id/stop', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const instance = await agentInvokerService.stopInstance(req.params.id as string);
    res.json({ instance });
  } catch (err) {
    console.error('[AgentRuntime] Stop instance failed:', err);
    res.status(500).json({ error: 'Failed to stop agent instance' });
  }
  return;
});

/**
 * POST /admin/agent-runtime/instances/:id/invoke
 */
router.post(
  '/instances/:id/invoke',
  validateBody(InvokeAgentSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await agentInvokerService.invokeAgent(req.params.id as string, req.body.input);
      res.json(result);
    } catch (err) {
      console.error('[AgentRuntime] Invoke agent failed:', err);
      res.status(500).json({ error: 'Failed to invoke agent' });
    }
    return;
  }
);

/**
 * GET /admin/agent-runtime/instances/:id/invocations
 */
router.get('/instances/:id/invocations', (req: AuthenticatedRequest, res: Response) => {
  const invocations = databaseService.getInvocations(req.params.id as string);
  res.json({ invocations });
  return;
});

/**
 * POST /admin/agent-runtime/compose
 * Compose an agent (resolve skills + MCP servers) without creating an instance
 */
router.post('/compose', validateBody(CreateInstanceSchema.pick({ agent_name: true, agent_version: true })), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const composed = await agentComposerService.compose(req.body.agent_name, req.body.agent_version);
    if (!composed) {
      res.status(404).json({ error: 'Agent not found or composition failed' });
      return;
    }
    res.json({ composed });
  } catch (err) {
    console.error('[AgentRuntime] Composition failed:', err);
    res.status(500).json({ error: 'Agent composition failed' });
  }
  return;
});

export default router;
