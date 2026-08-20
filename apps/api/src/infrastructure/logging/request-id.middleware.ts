import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { REQUEST_ID_HEADER } from '../../common/constants/request-id.header.js';
import { RequestContextService } from './request-context.service.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContext.run({ requestId }, () => {
      next();
    });
  }
}
