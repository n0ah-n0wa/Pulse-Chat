import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestContextStore } from './request-context.types.js';

/**
 * Holds per-request metadata such as the correlation ID.
 *
 * Values are scoped with {@link AsyncLocalStorage} so they propagate through
 * async call chains without threading arguments through every function.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(store: RequestContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
