import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { config } from './config/index.js';
import { agentRuntimeRoutes, ollamaRoutes } from './routes/index.js';
import { databaseService } from './services/index.js';

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

app.get('/admin/agent-runtime/health', (_req, res) => {
  const instanceCount = databaseService.listInstances().length;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    instances: instanceCount,
  });
});

app.use('/admin/agent-runtime', agentRuntimeRoutes);
app.use('/admin/ollama', ollamaRoutes);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error] Unhandled exception:');
  console.error('  Method:', req.method);
  console.error('  Path:', req.path);
  console.error('  Message:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

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

function bootstrap() {
  const reconciled = databaseService.markVolatileInstancesStopped();
  if (reconciled > 0) {
    console.log(`[Server] Reconciled ${reconciled} in-process agent instance(s) to stopped`);
  }

  httpServer = app.listen(config.port, () => {
    console.log(`[Server] Agent Runtime running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] Registry URL: ${config.registryUrl}`);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();

export default app;
