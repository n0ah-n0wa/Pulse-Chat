import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

/** Stable-enough id for this process, unique across clustered instances. */
export function createAppInstanceId(): string {
  return `pulse-api-${hostname()}:${String(process.pid)}:${randomUUID().slice(0, 8)}`;
}
