# ADR-002: Redis Pub/Sub bus instead of the Socket.IO Redis adapter

- Status: Accepted
- Date: 2026-08-22

## Context

Socket.IO `join(roomId)` is process-local. Two API containers must still
deliver `message:new`, typing, presence, notifications, and membership
eviction to sockets on the other process.

The Socket.IO Redis adapter would replicate `server.to(roomId).emit`
across instances. That couples fan-out to Socket.IO's room table and is
easy to misconfigure into double-emits (the originating process emits
locally and the adapter delivers the same event back).

## Decision

Own an application-level bus (`RedisRealtimeEventBus`) on dedicated
channels (`pulse:realtime:message`, `reaction`, `presence`,
`notification`, `typing`, `membership`).

Each published payload is a versioned envelope (`version: 1`, `event`,
`originInstanceId`, `occurredAt`, optional `roomId` / `userId`,
`payload`). The originating instance ignores its own envelopes. Remote
instances emit only to their local Socket.IO rooms.

`PUBLISH` is awaited on write paths. A dedicated Redis connection
subscribes because a connection in subscribe mode cannot run ordinary
commands.

Membership eviction uses `internal:member-removed` on
`pulse:realtime:membership`. That name is not a client event.

The Socket.IO Redis adapter is not a dependency.

## Alternatives considered

- **Socket.IO Redis adapter.** Faster to wire, opaque fan-out, harder to
  skip origin, no first-class membership-eviction event.
- **In-process EventEmitter.** Works in a single process; production
  compose runs two APIs.
- **MongoDB change streams.** Requires a replica set, which this stack
  does not run, and would couple “something was written” to “who should
  hear it” less clearly than an explicit bus.

## Consequences

- Adding an API replica needs the same `REDIS_URL` and a unique
  `APP_INSTANCE_ID`, not a Socket.IO adapter.
- Feature code depends on `RealtimeEventPublisher` /
  `RealtimeEventSubscriber`, not ioredis.
- Tests that claim multi-instance delivery must share one Redis stand-in
  between two Nest apps (`realtime-multi-instance.gateway.spec.ts`).
