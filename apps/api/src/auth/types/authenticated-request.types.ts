import type { Request } from 'express';

/** Authenticated identity available on protected HTTP requests. */
export interface AuthenticatedUser {
  readonly userId: string;
}

/** Express request extended with optional authenticated user context. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
