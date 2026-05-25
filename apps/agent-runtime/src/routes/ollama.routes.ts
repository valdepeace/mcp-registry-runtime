import { Router, Response } from 'express';
import { z } from 'zod';
import {
  authMiddleware,
  requireAdmin,
  validateBody,
  validateParams,
  AuthenticatedRequest,
} from '../middleware/index.js';
import { ollamaService } from '../services/ollama.service.js';
import { config } from '../config/index.js';
import jwt from 'jsonwebtoken';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

const PullBodySchema = z.object({
  model: z.string().min(1).max(200),
});

const ModelParamSchema = z.object({
  name: z.string().min(1),
});

/**
 * GET /admin/ollama/status
 */
router.get('/status', async (_req: AuthenticatedRequest, res: Response) => {
  const status = await ollamaService.getStatus();
  res.json(status);
  return;
});

/**
 * GET /admin/ollama/models
 */
router.get('/models', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const models = await ollamaService.listModels();
    res.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list models';
    res.status(502).json({ error: message });
  }
  return;
});

/**
 * GET /admin/ollama/ps
 */
router.get('/ps', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const models = await ollamaService.listRunning();
    res.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list running models';
    res.status(502).json({ error: message });
  }
  return;
});

/**
 * DELETE /admin/ollama/models/:name
 * name is URL-encoded (may contain colons, slashes)
 */
router.delete(
  '/models/:name',
  validateParams(ModelParamSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = decodeURIComponent(req.validatedParams!.name as string);
      await ollamaService.deleteModel(name);
      res.json({ message: `Model ${name} deleted` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete model';
      res.status(502).json({ error: message });
    }
    return;
  }
);

/**
 * POST /admin/ollama/pull
 * Streams pull progress as SSE. Use fetch() on the client (not EventSource)
 * since the body carries the model name.
 * Auth via Authorization header (standard middleware already applied above).
 */
router.post(
  '/pull',
  validateBody(PullBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { model } = req.body as { model: string };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of ollamaService.pullModel(model)) {
        send(event);
        if (event.type === 'complete' || event.type === 'error') break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pull failed';
      send({ type: 'error', error: message });
    }

    res.end();
    return;
  }
);

/**
 * GET /admin/ollama/pull/stream?model=...&token=...
 * EventSource-compatible SSE endpoint (GET + token in query param).
 */
router.get('/pull/stream', (req: AuthenticatedRequest, res: Response) => {
  const token = req.query['token'] as string | undefined;
  const model = req.query['model'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  if (!model) {
    res.status(400).json({ error: 'Missing model query param' });
    return;
  }

  try {
    jwt.verify(token, config.jwtSecret);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  (async () => {
    try {
      for await (const event of ollamaService.pullModel(model)) {
        send(event);
        if (event.type === 'complete' || event.type === 'error') break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pull failed';
      send({ type: 'error', error: message });
    }
    res.end();
  })();
});

export default router;
