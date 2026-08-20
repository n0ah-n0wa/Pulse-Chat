# Architecture

Pulse Chat is a real-time chat platform with a NestJS API, a React web client,
MongoDB for durable data, and Redis for ephemeral coordination. Nginx is the
single browser origin. The API is designed to run as **more than one process**
at once: Socket.IO rooms are local to each process, and Redis Pub/Sub is the
only path that carries realtime events between them.

## System context

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         │  React + TypeScript │
                         └──────────┬──────────┘
                                    │
                         HTTPS / WebSocket
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │       Nginx         │
                         │ Reverse Proxy       │
                         └──────────┬──────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                         ▼                     ▼
                 ┌───────────────┐     ┌───────────────┐
                 │   NestJS #1   │     │   NestJS #2   │
                 │ REST + WS     │     │ REST + WS     │
                 └───────┬───────┘     └───────┬───────┘
                         │                     │
                         └──────────┬──────────┘
                                    │
                           ┌────────┴────────┐
                           │                 │
                           ▼                 ▼
                    ┌─────────────┐   ┌─────────────┐
                    │    Redis    │   │   MongoDB   │
                    │ Presence    │   │ Users       │
                    │ Pub/Sub     │   │ Rooms       │
                    │ Rate limits │   │ Messages    │
                    └─────────────┘   │ Reactions   │
                                      └─────────────┘
```

Local development currently runs a single `api` container behind nginx
(`docker-compose.yml`). That is a convenience, not a limit of the design.
Production load-balances HTTP and WebSocket upgrades across API instances.
Every instance uses the same MongoDB replica set / URI and the same Redis
URL.

## Repository layout

| Package | Role |
| --- | --- |
| `@pulse-chat/api` | NestJS REST, Socket.IO, persistence, Redis |
| `@pulse-chat/web` | React UI (Vite) |
| `@pulse-chat/shared` | Types, Zod schemas, constants used by both apps |

Apps import `@pulse-chat/shared` by package name only. They never import each
other. Shared code stays platform-neutral (no DOM, no Node APIs).

## API module boundaries

```text
AppModule
 ├── AppConfigModule          env → typed config, APP_INSTANCE_ID
 ├── InfrastructureModule     MongoDB, Redis, logging, HTTP errors, health
 ├── AuthModule               register / login / refresh / logout
 ├── UsersModule              profiles, last-seen
 ├── RoomsModule              rooms and membership
 ├── MessagesModule           history, edits, deletes, reactions
 └── RealtimeModule
      ├── RealtimeGateway     Socket.IO auth, join/leave, message:send
      ├── PresenceModule      Redis presence keys + heartbeats
      └── RealtimeBroadcastModule
           ├── RedisRealtimeEventBus    Redis Pub/Sub adapter
           └── RealtimeMessageBroadcastService
```

Business services persist through repository interfaces (`MessageRepository`,
`RoomRepository`, `PresenceStore`, …). Redis and Mongoose implementations live
under `infrastructure/` folders so a storage swap does not rewrite domain logic.

`APP_INSTANCE_ID` is unique per process (`hostname:pid:short-uuid`). Presence
keys and Pub/Sub envelopes both carry it.

## Request flow (REST)

1. Nginx forwards `/api/*` to any NestJS instance.
2. `RequestIdMiddleware` attaches a correlation id.
3. `AuthGuard` validates the access JWT.
4. Controllers validate bodies with Zod pipes, call a service, map to the
   shared response type.
5. Mutations that must be visible on other connections (new / edited /
   deleted messages, reactions) go through
   `RealtimeMessageBroadcastService` **after** the write commits. The
   service emits to local Socket.IO rooms **and awaits** Redis `PUBLISH`.

REST and WebSocket share the same services. A message created over HTTP is
the same document a `message:send` event would create, and both paths publish
the same distributed event.

## Realtime flow (multi-instance)

Socket.IO `socket.join(roomId)` is **per process**. Client A on instance 1 and
client B on instance 2 are never in the same in-memory Socket.IO room. Sharing
a Socket.IO server object, or emitting only locally, cannot deliver
`message:new` across instances.

The application therefore owns a Redis Pub/Sub bus:

```text
Client A ──WS──► NestJS #1 ──publish──► Redis ──subscribe──► NestJS #2 ──WS──► Client B
                     │                                        │
                     └── local server.to(roomId).emit ────────┘
                         (only sockets on this process)
```

### Why Redis Pub/Sub instead of the Socket.IO Redis adapter

The Socket.IO Redis adapter would replicate every `server.to(roomId).emit`
to every instance. That couples fan-out to Socket.IO's internal rooms and
makes it easy to loop events (instance 1 emits, adapter re-emits on
instance 1). Pulse Chat publishes an explicit envelope instead:

- `version`, `event`, `originInstanceId`, `occurredAt`, optional `roomId` /
  `userId`, and `payload`
- dedicated channels: `pulse:realtime:message`, `pulse:realtime:reaction`,
  `pulse:realtime:presence`, `pulse:realtime:notification`
- the originating instance **ignores** envelopes whose `originInstanceId`
  matches its own, so local clients are not double-emitted
- remote instances emit only to their local Socket.IO rooms (members who
  have actually sent `room:join` on that connection)

`RedisRealtimeEventBus` implements `RealtimeEventPublisher` and
`RealtimeEventSubscriber`. Feature code depends on those interfaces, not on
ioredis. Each process opens a dedicated subscriber connection
(`RedisClient.createSubscriber()`), because a Redis connection in subscribe
mode cannot issue ordinary commands.

### Sequence: A sends, B receives on another instance

```text
A (instance 1)                 Redis                    B (instance 2)
    │                            │                           │
    │  message:send              │                           │
    │  room:join already done    │                           │  room:join already done
    ▼                            │                           │
MessagesService.createMessage    │                           │
    │                            │                           │
    │  emit message:new locally  │                           │
    │  PUBLISH pulse:realtime:message                        │
    │───────────────────────────►│                           │
    │                            │  message (origin=1)       │
    │                            │──────────────────────────►│
    │                            │                           │ skip if origin == self
    │                            │                           │ server.to(roomId).emit
    │                            │                           ▼
    │                            │                      message:new
```

Publish is awaited on the write path so a client that immediately disconnects
does not drop the remote delivery, and so tests can assert on the remote
socket without racing a fire-and-forget `PUBLISH`.

### Presence

Presence is stored in Redis, not in MongoDB:

- `presence:session:{socketId}` → user id (TTL)
- `presence:user:{userId}:sessions` → set of socket ids
- `presence:user:{userId}` → `{ status, lastSeen, instanceId }`

A user is online while at least one session key remains, including sessions
owned by other API processes. Heartbeats refresh TTLs on the instance that
holds the socket. First transition to online publishes `user:online`; last
session removed publishes `user:offline`. Those events use the same bus
(`pulse:realtime:presence`) and are emitted to **all** local sockets on each
instance (presence is not room-scoped).

`PresenceNotifier` is implemented by `RealtimeMessageBroadcastService`. The
gateway awaits `PresenceService.connect` / `disconnect` so Redis and Pub/Sub
are updated before the connection handler returns.

### What is not faked

- Two Nest applications listen on two TCP ports.
- Each has its own Socket.IO `Server`.
- They share Redis (Pub/Sub + keyspace) and MongoDB.
- Cross-instance `message:new` and `user:online` / `user:offline` are
  asserted in `apps/api/src/realtime/realtime-multi-instance.gateway.spec.ts`.
  The test injects **one** `TestRedisService` (ioredis-mock) into both apps
  and spies on `publish` to prove the message and presence channels are used.
  Isolated mocks per app would make Pub/Sub silently fail; that is why the
  stand-in is shared rather than replaced with an in-process event emitter
  that bypasses Redis.

Typing indicators are specified as ephemeral Redis state and will use the
same bus when that feature lands. They are not persisted.

## Frontend state (planned)

The web app is still a shell. When client state is implemented (specification
section 36):

| Store | Owns |
| --- | --- |
| Zustand | Auth session, current user, current room, socket connection, transient UI |
| TanStack Query | REST resources: rooms, message history, notifications, profiles |

Realtime events patch query caches (or room-scoped message lists) rather than
duplicating server records in Zustand.

## Horizontal scaling

| Concern | Mechanism |
| --- | --- |
| HTTP | Any instance; nginx load-balances |
| WebSocket | Sticky or not: each socket lives on one instance; events fan out via Redis |
| Auth sessions | JWT + hashed refresh tokens in MongoDB |
| Presence | Redis keys + Pub/Sub |
| Rate limits | Redis counters |
| Message history | MongoDB |

Adding an API replica does not require a Socket.IO adapter. It requires the
new process to use the same `REDIS_URL` and `MONGODB_URI`, and to keep a
unique `APP_INSTANCE_ID` (the default factory already does).
