# ADR-007: Ephemeral Redis (`noeviction`, no persistence)

- Status: Accepted
- Date: 2026-08-22

## Context

Redis holds presence keys (TTL 45s), rate-limit counters, and Pub/Sub.
If Redis restarts, those keys disappear. If Redis evicts keys under
memory pressure, users can appear offline while their sockets are still
open, or rate-limit windows can reset silently.

## Decision

Run Redis as **ephemeral coordination**, not a cache:

- `--save "" --appendonly no` in development and production compose
- `maxmemory-policy noeviction` so memory pressure fails writes instead
  of dropping presence or counters
- Presence heartbeats every 15s refresh TTLs

Durable data (users, messages, hashed refresh tokens) stays in MongoDB.

## Alternatives considered

- **RDB/AOF.** Would restore stale presence and expired-looking
  rate-limit keys after a crash; online/offline would lie until TTLs
  caught up.
- **`allkeys-lru`.** Typical cache policy; wrong for presence.
- **Store presence in MongoDB.** Extra writes on every heartbeat; worse
  latency for a value that is allowed to be wrong after a short TTL.

## Consequences

- A Redis restart clears online state and rate-limit windows. Clients
  reconnect and presence rebuilds from new heartbeats.
- Operators must size Redis so `noeviction` does not become a production
  outage; that is preferable to silent incorrect presence.
- Redis is not a second source of truth for chat history.
