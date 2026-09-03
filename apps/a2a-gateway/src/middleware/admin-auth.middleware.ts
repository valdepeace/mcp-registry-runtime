import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Key management (issue/revoke) reuses the dashboard's own admin login —
 * same JWT_SECRET as apps/runtime, so the token the admin already has from
 * logging into the dashboard works here unchanged. No second login to build.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), config.jwtSecret) as { role: string };
    if (decoded.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
