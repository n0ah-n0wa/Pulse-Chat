import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Overall health including dependency checks' })
  getHealth() {
    return this.healthService.summary();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe (MongoDB and Redis must be reachable)' })
  async getReadiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.summary();

    if (result.status === 'error') {
      res.status(503);
    }

    return result;
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe (process is running)' })
  getLiveness() {
    return this.healthService.liveness();
  }
}
