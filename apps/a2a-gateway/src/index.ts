import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { config } from './config/index.js';
import { agentCardRoutes, a2aRoutes, adminRoutes } from './routes/index.js';
import { databaseService } from './services/index.js';
import { requireAdmin } from './middleware/index.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));

// A coarse ceiling on top of the per-key limit in a2a-auth.middleware.ts —
// that one protects a single key's budget, this one protects the process.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Agent Card + /a2a itself: card is public by convention, /a2a is gated by
// its own X-Api-Key middleware (see a2aRoutes), not the admin JWT below.
app.use(agentCardRoutes);
app.use(a2aRoutes);

// Key management and the request log are admin-only (dashboard's own login).
app.use('/admin/a2a', requireAdmin, adminRoutes);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[A2A Gateway] Unhandled exception:');
  console.error('  Method:', req.method);
  console.error('  Path:', req.path);
  console.error('  Message:', err.message);
  console.error('  Stack:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[A2A Gateway] Received ${signal} — shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[A2A Gateway] Shutdown timed out — forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('[A2A Gateway] HTTP server closed.');
    }
    databaseService.close();
    console.log('[A2A Gateway] Database closed.');
  } catch (err) {
    console.error('[A2A Gateway] Error during shutdown:', err);
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

let httpServer: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  httpServer = app.listen(config.port, () => {
    console.log(`[A2A Gateway] Running on port ${config.port}`);
    console.log(`[A2A Gateway] Environment: ${config.nodeEnv}`);
    console.log(`[A2A Gateway] Agent Card: ${config.publicUrl}/.well-known/agent-card.json`);
    console.log(`[A2A Gateway] Registry: ${config.registryUrl}  Runtime: ${config.runtimeUrl}`);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch(err => {
  console.error('[A2A Gateway] Failed to start:', err);
  process.exit(1);
});

export default app;
