import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { config } from './config/index.js';
import { publicRoutes, adminRoutes } from './routes/index.js';
import { syncService, databaseService, seedBuiltInAgents } from './services/index.js';

const app = express();

// --- Security & rate limiting middleware ---
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));

// General rate limiter — 500 requests per 15 min window per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sync: syncService.getStatus(),
  });
});

// Public API routes (compatible with official MCP registry)
app.use('/v0.1', publicRoutes);

// Stricter rate limiting on login endpoint (15 min, 10 max)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});
app.use('/admin/login', loginLimiter);

// Admin routes (login already has its own limiter above)
app.use('/admin', adminRoutes);

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error] Unhandled exception:');
  console.error('  Method:', req.method);
  console.error('  Path:', req.path);
  console.error('  Body:', JSON.stringify(req.body, null, 2));
  console.error('  Message:', err.message);
  console.error('  Stack:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal} — shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[Server] Shutdown timed out — forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    const server = httpServer;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('[Server] HTTP server closed.');
    }

    syncService.stopPeriodicSync();
    databaseService.close();
    console.log('[Server] Database closed.');
  } catch (err) {
    console.error('[Server] Error during shutdown:', err);
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
let httpServer: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  // Create default admin user if not exists
  const existingAdmin = databaseService.getUser(config.adminUsername);
  if (!existingAdmin) {
    const hash = await bcrypt.hash(config.adminPassword, 10);
    databaseService.createUser(config.adminUsername, hash);
    console.log(`[Bootstrap] Created admin user: ${config.adminUsername}`);
  }

  // Seed built-in agents (idempotent upsert)
  seedBuiltInAgents();

  // Start sync service
  syncService.startPeriodicSync();

  // Start server
  httpServer = app.listen(config.port, () => {
    console.log(`[Server] MCP Registry running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] Official registry: ${config.officialRegistryUrl}`);
  });
}

// Wire shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch(err => {
  console.error('[Bootstrap] Failed to start:', err);
  process.exit(1);
});

export default app;
