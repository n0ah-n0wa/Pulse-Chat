const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;

/**
 * True when a Redis command failed for a reason that is likely to recover
 * after a reconnect or a short wait (network blip, loading, failover).
 */
export function isTransientRedisError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('temporarily unavailable') ||
    message.includes('connection is closed') ||
    message.includes("stream isn't writeable") ||
    message.includes('readonly') ||
    message.includes('loading redis') ||
    message.includes('command timed out') ||
    message.includes('socket closed') ||
    message.includes('subscriber is disconnected') ||
    message.includes('connection lost')
  );
}

export async function withRedisRetry<T>(
  operation: () => Promise<T>,
  options: { readonly attempts?: number; readonly baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientRedisError(error) || attempt === attempts) {
        throw error;
      }

      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
