import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../../common/constants/request-id.header.js';
import { RequestContextService } from './request-context.service.js';
import { resolveIncomingRequestId } from './resolve-request-id.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveIncomingRequestId(req.headers[REQUEST_ID_HEADER]);

    res.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContext.run({ requestId }, () => {
      next();
    });
  }
}
