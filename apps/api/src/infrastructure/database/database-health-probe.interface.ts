/** Minimal contract for MongoDB readiness probes. */
export interface DatabaseHealthProbe {
  ping(): Promise<void>;
}
