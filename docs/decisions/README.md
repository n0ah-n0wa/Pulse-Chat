# Architecture decision records

One file per decision. Status is **Accepted** for decisions encoded in
the current codebase.

| ADR                                    | Decision                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| [001](./001-mongodb.md)                | MongoDB for durable chat data                                  |
| [002](./002-redis-pubsub.md)           | Application Redis Pub/Sub bus, not the Socket.IO Redis adapter |
| [003](./003-socket-io.md)              | Socket.IO with websocket-only transport                        |
| [004](./004-cursor-pagination.md)      | Cursor pagination on `(createdAt, _id)`                        |
| [005](./005-zustand-tanstack-query.md) | Zustand for session/ephemeral state, TanStack Query for REST   |
| [006](./006-local-file-storage.md)     | Local disk for attachments (no S3 adapter)                     |
| [007](./007-ephemeral-redis.md)        | Redis without persistence and with `noeviction`                |
| [008](./008-jwt-refresh-families.md)   | HS256 JWTs with hashed refresh families in MongoDB             |
| [009](./009-shared-zod-package.md)     | `@pulse-chat/shared` Zod schemas as the contract               |

These records describe **implemented** tradeoffs. They are not a backlog
of alternatives still under consideration.
