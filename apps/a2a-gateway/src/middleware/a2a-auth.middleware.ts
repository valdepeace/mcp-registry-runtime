import { Request, Response, NextFunction } from 'express';
import { keyService, type ApiKey } from '../services/index.js';

export interface A2ARequest extends Request {
  apiKey?: ApiKey;
}

/**
 * Per-key token bucket, refilled once a minute. In-memory: a gateway restart
 * resets everyone's budget, which is fine for a rate limit (not a quota) and
 * avoids a write per request against the same SQLite file the request log uses.
 */
const buckets = new Map<string, { tokens: number; resetAt: number }>();

function takeToken(keyId: string, perMinute: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(keyId);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { tokens: perMinute, resetAt: now + 60_000 };
    buckets.set(keyId, bucket);
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

/** No anonymous callers — every A2A request carries an X-Api-Key issued from the dashboard. */
export function a2aAuthMiddleware(req: A2ARequest, res: Response, next: NextFunction): void {
  const key = req.header('X-Api-Key');
  if (!key) {
    res.status(401).json({ error: 'Missing X-Api-Key header' });
    return;
  }

  const found = keyService.verify(key);
  if (!found) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return;
  }

  if (!takeToken(found.id, found.requests_per_min)) {
    res.status(429).json({ error: 'Rate limit exceeded for this key' });
    return;
  }

  req.apiKey = found;
  next();
}
