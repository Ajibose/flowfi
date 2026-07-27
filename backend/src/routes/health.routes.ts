import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { INDEXER_STATE_ID } from '../lib/indexer-state.js';
import { sorobanEventWorker } from '../workers/soroban-event-worker.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Detailed health check
 *     description: |
 *       Returns liveness and readiness information.
 *       **Liveness** (200 vs 503) is determined by DB reachability alone.
 *       **Indexer lag** is reported in the body for observability but only
 *       forces a 503 when the indexer is actually enabled
 *       (`STREAM_CONTRACT_ID` env var set) and its state row is stale
 *       (lag > 60 s). A cold-started instance with no state row yet, or a
 *       deployment with the indexer intentionally disabled, always returns 200
 *       as long as the DB is reachable.
 *       **Event-processing failures** are also reported. When the indexer is
 *       enabled and recent per-event failures spike (≥50% of attempts in the
 *       last 5 minutes, with ≥3 samples), the endpoint returns 503 even if
 *       lag looks healthy (the IndexerState upsert bumps updatedAt every poll).
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 db:
 *                   type: string
 *                   example: connected
 *                 indexerEnabled:
 *                   type: boolean
 *                   description: Whether the event indexer is configured
 *                   example: true
 *                 indexerLag:
 *                   type: integer
 *                   nullable: true
 *                   description: Seconds since last indexer update, or null when no state row exists yet
 *                   example: 5
 *                 eventsProcessed:
 *                   type: integer
 *                   description: Lifetime count of successfully processed indexer events
 *                 eventsFailed:
 *                   type: integer
 *                   description: Lifetime count of indexer events that threw during processing
 *                 lastErrorAt:
 *                   type: string
 *                   nullable: true
 *                   description: ISO timestamp of the most recent per-event processing failure
 *                 indexerDegraded:
 *                   type: boolean
 *                   description: True when recent event-processing failure rate indicates a spike
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 *                   example: 3600
 *       503:
 *         description: Service is degraded or unhealthy
 */
router.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'disconnected';
  }

  // Whether the event-indexer is configured (STREAM_CONTRACT_ID must be set for it to run).
  const indexerEnabled = !!process.env.STREAM_CONTRACT_ID;

  let indexerLag = -1;
  try {
    const state = await prisma.indexerState.findUnique({ where: { id: INDEXER_STATE_ID } });
    if (state) {
      const now = Math.floor(Date.now() / 1000);
      const updatedAt = Math.floor(state.updatedAt.getTime() / 1000);
      indexerLag = Math.max(0, now - updatedAt);
    }
    // indexerLag === -1 means no state row yet (cold start) — not an error.
  } catch {
    indexerLag = -1;
  }

  const eventCounters = sorobanEventWorker.getEventCounters();

  // 503 when: DB is down, OR the indexer is enabled and its state row is
  // stale (lag > 60), OR recent event-processing failures are spiking.
  // A missing state row (lag === -1) is a cold-start condition, not a failure,
  // even when the indexer is enabled.
  const indexerLagDegraded = indexerEnabled && indexerLag > 60;
  const indexerFailureDegraded = indexerEnabled && eventCounters.degraded;
  const isHealthy =
    dbStatus === 'connected' && !indexerLagDegraded && !indexerFailureDegraded;
  const status = isHealthy ? 'ok' : 'degraded';

  res.status(isHealthy ? 200 : 503).json({
    status,
    db: dbStatus,
    indexerEnabled,
    indexerLag: indexerLag === -1 ? null : indexerLag,
    eventsProcessed: eventCounters.eventsProcessed,
    eventsFailed: eventCounters.eventsFailed,
    lastErrorAt: eventCounters.lastErrorAt,
    indexerDegraded: eventCounters.degraded,
    uptime: process.uptime(),
  });
});

export default router;
