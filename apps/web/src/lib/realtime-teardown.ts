type Teardown = () => void;

let teardownRealtime: Teardown | undefined;

/** Lets the socket module register a disconnect hook without a circular import. */
export function setRealtimeTeardown(handler: Teardown): void {
  teardownRealtime = handler;
}

/** Drops the realtime transport immediately so events cannot refill a cleared cache. */
export function teardownRealtimeTransport(): void {
  teardownRealtime?.();
}
