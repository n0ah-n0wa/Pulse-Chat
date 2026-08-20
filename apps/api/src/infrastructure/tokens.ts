/** Injection token for the Redis client abstraction. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Injection token for Redis health checks. */
export const REDIS_HEALTH_PROBE = Symbol('REDIS_HEALTH_PROBE');

/** Injection token for MongoDB health checks. */
export const DATABASE_HEALTH_PROBE = Symbol('DATABASE_HEALTH_PROBE');

/** Re-exported from the storage module for infrastructure-wide discovery. */
export { FILE_STORAGE } from './storage/file-storage.tokens.js';
