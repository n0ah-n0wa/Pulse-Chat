import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestContextAssignment, RequestContextStore } from './request-context.types.js';

interface MutableRequestContextStore {
  requestId: string;
  userId?: string;
  roomId?: string;
  messageId?: string;
}

/**
 * Holds per-request metadata such as the correlation ID.
 *
 * Values are scoped with {@link AsyncLocalStorage} so they propagate through
 * async call chains without threading arguments through every function.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<MutableRequestContextStore>();

  run<T>(store: RequestContextStore, callback: () => T): T {
    const copy: MutableRequestContextStore = { requestId: store.requestId };
    if (store.userId !== undefined) {
      copy.userId = store.userId;
    }
    if (store.roomId !== undefined) {
      copy.roomId = store.roomId;
    }
    if (store.messageId !== undefined) {
      copy.messageId = store.messageId;
    }

    return this.storage.run(copy, callback);
  }

  assign(fields: RequestContextAssignment): void {
    const store = this.storage.getStore();
    if (store === undefined) {
      return;
    }

    if (fields.userId !== undefined) {
      store.userId = fields.userId;
    }
    if (fields.roomId !== undefined) {
      store.roomId = fields.roomId;
    }
    if (fields.messageId !== undefined) {
      store.messageId = fields.messageId;
    }
  }

  snapshot(): RequestContextStore | undefined {
    const store = this.storage.getStore();
    return store === undefined ? undefined : { ...store };
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }
}
