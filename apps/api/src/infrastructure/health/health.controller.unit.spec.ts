import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import request from 'supertest';

import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController HTTP semantics', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            summary: vi.fn().mockResolvedValue({
              status: 'error',
              checks: { mongodb: 'error', redis: 'ok' },
            }),
            liveness: vi.fn().mockReturnValue({ status: 'ok' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 503 from readiness when dependencies are unhealthy', async () => {
    await request(httpServer)
      .get('/health/readiness')
      .expect(503)
      .expect({
        status: 'error',
        checks: { mongodb: 'error', redis: 'ok' },
      });
  });
});
