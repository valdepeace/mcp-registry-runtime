import { Router, Request, Response } from 'express';
import { keyService, requestLogService } from '../services/index.js';

const router = Router();

router.get('/keys', (_req: Request, res: Response) => {
  res.json({ keys: keyService.list() });
});

router.post('/keys', (req: Request, res: Response) => {
  const { label, requests_per_min } = req.body as { label?: string; requests_per_min?: number };
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }
  const { key, plaintext } = keyService.issue(label, requests_per_min ?? 30);
  // The plaintext key is returned exactly once — the dashboard must show it now.
  res.status(201).json({ key, plaintext });
});

router.delete('/keys/:id', (req: Request, res: Response) => {
  const revoked = keyService.revoke(req.params.id as string);
  if (!revoked) {
    res.status(404).json({ error: 'Key not found or already revoked' });
    return;
  }
  res.json({ message: 'Key revoked' });
});

router.get('/requests', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json({ requests: requestLogService.list(limit) });
});

export { router as adminRoutes };
