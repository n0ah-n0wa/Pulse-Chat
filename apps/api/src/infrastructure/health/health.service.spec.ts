import { describe, expect, it, vi } from 'vitest';

import { HealthService } from './health.service.js';
import type { DatabaseHealthProbe } from '../database/database-health-probe.interface.js';
import type { RedisHealthProbe } from '../redis/redis-client.interface.js';

describe('HealthService', () => {
  it('returns ok for liveness without touching dependencies', () => {
    const service = new HealthService(
      { ping: vi.fn() } satisfies DatabaseHealthProbe,
      { check: vi.fn() } satisfies RedisHealthProbe,
    );

    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('reports ok when MongoDB and Redis respond', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockResolvedValue(undefined) },
      { check: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.summary()).resolves.toEqual({
      status: 'ok',
      checks: { mongodb: 'ok', redis: 'ok' },
    });
  });

  it('includes dependency status in the summary when unhealthy', async () => {
    const service = new HealthService(
      { ping: vi.fn().mockRejectedValue(new Error('mongo down')) },
      { check: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(service.summary()).resolves.toEqual({
      status: 'error',
      checks: { mongodb: 'error', redis: 'ok' },
    });
  });
});
