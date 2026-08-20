import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../types/authenticated-request.types.js';

/** Returns the authenticated user attached to the request by the auth layer. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user === undefined) {
      throw new Error('CurrentUser decorator requires AuthGuard to run first');
    }

    return user;
  },
);
