/** Seconds a presence key remains valid without a heartbeat. */
export const PRESENCE_TTL_SECONDS = 45;

/** How often active connections refresh their Redis TTLs. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 15_000;
