import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/types/authenticated-request.types.js';

/** Attaches an authenticated user to incoming requests in integration tests. */
export function authenticatedUserMiddleware(userId: string): RequestHandler {
  return (req, _res, next) => {
    (req as AuthenticatedRequest).user = { userId };
    next();
  };
}

/** Reads `x-test-user-id` in integration tests to simulate authentication. */
export function testAuthenticatedUserHeaderMiddleware(
  headerName = 'x-test-user-id',
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const testUserId = req.headers[headerName];
    if (typeof testUserId === 'string' && testUserId.length > 0) {
      (req as AuthenticatedRequest).user = { userId: testUserId };
    }
    next();
  };
}
