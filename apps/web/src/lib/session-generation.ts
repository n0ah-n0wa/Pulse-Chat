let sessionGeneration = 0;

/** Monotonic counter that changes whenever the local session is torn down. */
export function currentSessionGeneration(): number {
  return sessionGeneration;
}

/** Invalidates in-flight token rotation so it cannot restore a signed-out session. */
export function bumpSessionGeneration(): number {
  sessionGeneration += 1;
  return sessionGeneration;
}
