import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { config } from './config/index.js';
import { runtimeRoutes } from './routes/index.js';
import { databaseService, runtimeService, pm2Service } from './services/index.js';
import { authMiddleware, requireAdmin } from './middleware/index.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/admin/runtime/health', authMiddleware, requireAdmin, (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Bridge: accept JWT from query param for SSE (EventSource can't set headers)
app.use('/admin/runtime/events', (req, _res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
});

// All runtime routes require authentication
app.use('/admin/runtime', authMiddleware);
app.use('/admin/runtime', requireAdmin);

// Mount runtime routes
app.use('/admin/runtime', runtimeRoutes);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Runtime] Unhandled exception:');
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
  console.log(`\n[Runtime] Received ${signal} — shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[Runtime] Shutdown timed out — forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    const server = httpServer;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('[Runtime] HTTP server closed.');
    }

    const instances = runtimeService.listInstances();
    const runningInstances = instances.filter(
      (i) => i.status === 'online' || i.status === 'degraded' || i.status === 'starting' || i.status === 'stopping'
    );
    if (runningInstances.length > 0) {
      console.log(`[Runtime] Stopping ${runningInstances.length} MCP instance(s)...`);
      await Promise.allSettled(
        runningInstances.map((inst) => runtimeService.stopInstance(inst.id))
      );
      console.log('[Runtime] All MCP instances stopped.');
    }

    pm2Service.disconnect();
    console.log('[Runtime] PM2 disconnected.');

    databaseService.close();
    console.log('[Runtime] Database closed.');
  } catch (err) {
    console.error('[Runtime] Error during shutdown:', err);
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

let httpServer: ReturnType<typeof app.listen> | null = null;

async function bootstrap() {
  runtimeService.startMetricsPolling();

  httpServer = app.listen(config.port, () => {
    console.log(`[Runtime] MCP Runtime running on port ${config.port}`);
    console.log(`[Runtime] Environment: ${config.nodeEnv}`);
    console.log(`[Runtime] Registry URL: ${config.registryUrl}`);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch(err => {
  console.error('[Runtime] Failed to start:', err);
  process.exit(1);
});

export default app;
