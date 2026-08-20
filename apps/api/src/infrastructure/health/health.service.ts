import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_HEALTH_PROBE, REDIS_HEALTH_PROBE } from '../tokens.js';
import type { DatabaseHealthProbe } from '../database/database-health-probe.interface.js';
import type { RedisHealthProbe } from '../redis/redis-client.interface.js';

export type DependencyStatus = 'ok' | 'error';

export interface HealthCheckResult {
  readonly status: 'ok' | 'error';
  readonly checks: {
    readonly mongodb: DependencyStatus;
    readonly redis: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_HEALTH_PROBE) private readonly database: DatabaseHealthProbe,
    @Inject(REDIS_HEALTH_PROBE) private readonly redis: RedisHealthProbe,
  ) {}

  liveness(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  async summary(): Promise<HealthCheckResult> {
    const checks = await this.runDependencyChecks();
    const status =
      checks.mongodb === 'ok' && checks.redis === 'ok' ? ('ok' as const) : ('error' as const);

    return { status, checks };
  }

  private async runDependencyChecks(): Promise<HealthCheckResult['checks']> {
    const [mongodb, redis] = await Promise.all([
      this.safeCheck(() => this.database.ping()),
      this.safeCheck(() => this.redis.check()),
    ]);

    return { mongodb, redis };
  }

  private async safeCheck(check: () => Promise<void>): Promise<DependencyStatus> {
    try {
      await check();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
