import { randomUUID } from 'node:crypto';

/** Reject oversized or non-printable correlation IDs so they cannot bloat logs. */
const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[\x21-\x7E]+$/;

/**
 * Uses a client-supplied correlation ID when it is a single printable string,
 * otherwise generates a UUID.
 */
export function resolveIncomingRequestId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(raw)
  ) {
    return raw;
  }

  return randomUUID();
}
