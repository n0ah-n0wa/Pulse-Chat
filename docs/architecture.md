# Architecture

Pulse Chat is a real-time chat platform with a NestJS API, a React web client,
MongoDB for durable data, and Redis for ephemeral coordination. Nginx is the
single browser origin. The API is designed to run as **more than one process**
at once: Socket.IO rooms are local to each process, and a Redis Pub/Sub **bus**
is the only path that carries realtime events between them.

This document describes the implementation in this repository. It does not
describe planned backends (S3, a Socket.IO Redis adapter, cookie sessions) as
if they were present.

## System context

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         │  React + TypeScript │
                         └──────────┬──────────┘
                                    │
                         HTTP / WebSocket
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │       Nginx         │
                         │ Reverse proxy       │
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
                    │ Pub/Sub bus │   │ Rooms       │
                    │ Rate limits │   │ Members     │
                    └─────────────┘   │ Messages    │
                                      │ Reactions   │
                                      │ Attachments │
                                      │ Notifications│
                                      │ Refresh tokens│
                                      └─────────────┘
```

Local development currently runs a single `api` container behind nginx
(`docker-compose.yml`). That is a convenience, not a limit of the design.
`docker-compose.prod.yml` load-balances HTTP and WebSocket upgrades across
`api-1` and `api-2` with `least_conn`. Every instance uses the same MongoDB
URI and the same Redis URL; Socket.IO rooms stay process-local and Redis
Pub/Sub carries events between them.

TLS is not terminated in compose. The browser talks HTTP on loopback
(`http://localhost:8080`). Production secrets and authenticated stores appear
only in `docker-compose.prod.yml`.

## Repository layout

| Package              | Role                                            |
| -------------------- | ----------------------------------------------- |
| `@pulse-chat/api`    | NestJS REST, Socket.IO, persistence, Redis      |
| `@pulse-chat/web`    | React UI (Vite)                                 |
| `@pulse-chat/shared` | Types, Zod schemas, constants used by both apps |

Apps import `@pulse-chat/shared` by package name only. They never import each
other. Shared code stays platform-neutral (no DOM, no Node APIs).

## API module boundaries

```text
AppModule
 ├── AppConfigModule          env → typed config, APP_INSTANCE_ID
 ├── InfrastructureModule     MongoDB, Redis, logging, HTTP errors,
 │                            health, local file storage
 ├── RateLimitModule          Redis fixed-window counters (global)
 ├── AuthModule               register / login / refresh / logout / me
 ├── UsersModule              profiles, avatars, last-seen
 ├── RoomsModule              rooms, membership, mark-read
 ├── MessagesModule           history, search, edits, deletes, reactions,
 │                            mentions
 ├── AttachmentsModule        upload, delete, authenticated download
 ├── NotificationsModule      list and mark-read
 └── RealtimeModule
      ├── RealtimeGateway     Socket.IO auth, join/leave, message:send,
      │                       typing
      ├── PresenceModule      Redis presence keys + heartbeats
      └── RealtimeBroadcastModule
           ├── RedisRealtimeEventBus    Redis Pub/Sub publisher/subscriber
           └── RealtimeMessageBroadcastService
```

`FILE_STORAGE_PROVIDER=s3` is a valid config enum value and is **rejected at
startup**. Only `LocalFileStorage` is wired. Production compose shares an
`api-storage` volume so both API processes see the same files.

Business services persist through repository interfaces (`MessageRepository`,
`RoomRepository`, `PresenceStore`, …). Redis and Mongoose implementations live
under `infrastructure/` folders so a storage swap does not rewrite domain
logic.

`APP_INSTANCE_ID` is unique per process (`hostname:pid:short-uuid`). Presence
keys and Pub/Sub envelopes both carry it. HTTP responses also set
`X-Pulse-Instance` to that id.

## Request flow (REST)

1. Nginx forwards `/api/*` to a NestJS instance. Production nginx also
   forwards `/health*` and `/socket.io/`. Development nginx forwards `/api/`
   and `/socket.io/` only (see [`deployment.md`](./deployment.md)).
2. `RequestIdMiddleware` attaches a correlation id (`X-Request-ID`).
3. `HttpRequestLoggingMiddleware` records method, path, status, and duration
   when the response finishes (health probes excluded).
4. `AuthGuard` (when present) validates the access JWT and binds `userId`
   onto the log context. Public routes skip this.
5. Controllers validate bodies and query strings with Zod pipes, call a
   service, and map to a shared response type.
6. Mutations that must be visible on other connections (new / edited /
   deleted messages, reactions, notifications, membership eviction) go
   through `RealtimeMessageBroadcastService` **after** the write commits.
   The service emits to local Socket.IO rooms **and awaits** Redis
   `PUBLISH`.

REST and WebSocket share the same services. A message created over HTTP is
the same document a `message:send` event would create, and both paths
publish the same distributed event.

## Realtime flow (multi-instance)

Socket.IO `socket.join(roomId)` is **per process**. Client A on instance 1
and client B on instance 2 are never in the same in-memory Socket.IO room.
Sharing a Socket.IO server object, or emitting only locally, cannot deliver
`message:new` across instances.

The application therefore owns a Redis Pub/Sub bus
(`RedisRealtimeEventBus`). This is **not** the Socket.IO Redis adapter: the
adapter is not a dependency and is not used.

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
- dedicated channels:
  - `pulse:realtime:message`
  - `pulse:realtime:reaction`
  - `pulse:realtime:presence`
  - `pulse:realtime:notification`
  - `pulse:realtime:typing`
  - `pulse:realtime:membership`
- the originating instance **ignores** envelopes whose `originInstanceId`
  matches its own, so local clients are not double-emitted
- remote instances emit only to their local Socket.IO rooms (members who
  have actually sent `room:join` on that connection)

`internal:member-removed` travels on `pulse:realtime:membership`. It is
**not** a client Socket.IO event. Remote instances use it to `socket.leave`
the room and emit `room:left` to that user's local sockets after REST
leave, remove, or delete.

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

Publish is awaited on the write path so a client that immediately
disconnects does not drop the remote delivery, and so tests can assert on
the remote socket without racing a fire-and-forget `PUBLISH`.

### Presence

Presence is stored in Redis, not in MongoDB:

- `presence:session:{socketId}` → user id (TTL 45s)
- `presence:user:{userId}:sessions` → set of socket ids
- `presence:user:{userId}` → `{ status, lastSeen, instanceId }`

A user is online while at least one session key remains, including sessions
owned by other API processes. Heartbeats every 15s refresh TTLs on the
instance that holds the socket. First transition to online publishes
`user:online`; last session removed publishes `user:offline`. Those events
use `pulse:realtime:presence` and are emitted to **all** local sockets on
each instance (presence is not room-scoped).

Connecting also writes `lastSeenAt` on the user document in MongoDB.

`PresenceNotifier` is implemented by `RealtimeMessageBroadcastService`. The
gateway awaits `PresenceService.connect` / `disconnect` so Redis and Pub/Sub
are updated before the connection handler returns.

Joining a Socket.IO room also pushes a **presence snapshot**: the joining
socket receives `user:online` for currently online members, then the room
receives `user:online` for the joiner (the joiner is not echoed).

### Membership eviction

REST leave, member removal, and room delete call
`RealtimeMessageBroadcastService.evictMemberFromRoom`. Locally that leaves
matching sockets and emits `room:left`. Remotely, `internal:member-removed`
does the same on other API processes so a removed user cannot keep
receiving `message:new` for that room.

### What is not faked

- Two Nest applications listen on two TCP ports in production compose.
- Each has its own Socket.IO `Server`.
- They share Redis (Pub/Sub + keyspace) and MongoDB.
- Cross-instance `message:new`, `typing:started`, and `user:online` /
  `user:offline` are asserted in
  `apps/api/src/realtime/realtime-multi-instance.gateway.spec.ts`.
  The test injects **one** `TestRedisService` (ioredis-mock) into both apps
  and spies on `publish` to prove the message, typing, and presence channels
  are used.

Typing indicators are ephemeral (not stored in MongoDB). They use
`pulse:realtime:typing`. The origin socket uses `socket.to(roomId)` so the
typer is not echoed.

## Frontend state

The web app is a React SPA. Routes that matter:

| Path                         | Role                                           |
| ---------------------------- | ---------------------------------------------- |
| `/`                          | Marketing/foundation landing (not the chat UI) |
| `/login`, `/register`        | Guest-only auth pages                          |
| `/app`, `/app/rooms/:roomId` | Authenticated workspace                        |
| `/settings`                  | Authenticated profile and theme                |
| `/profile/:username`         | Public profile                                 |

`AppShell` (used on `/`, auth, settings, and profile) runs
`useRealtimeConnection`, `useRealtimeSync`, and
`useMemberRoomSubscriptions` so a signed-in user keeps the socket and
query cache in sync even when they are not on `/app`.

| Store          | Owns                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| Zustand        | Auth session, socket connection, presence, typing, unread overlays, room UI |
| TanStack Query | REST resources: rooms, message history, notifications, profiles             |

Auth tokens persist in `localStorage` under `pulse-chat-auth` (Zustand
`persist`). Logout and failed token refresh call `resetClientState` and
bump a session generation counter so an in-flight refresh cannot restore
tokens after sign-out. REST `401` responses rotate the refresh token once
(single-flight) before the session is dropped.

Token refresh on the socket path disconnects the Engine.IO transport but
**keeps room refcounts** so `room:join` is restored after reconnect.

Attachment and avatar bytes are fetched with `Authorization: Bearer` and
shown via blob URLs. The SPA never uses a raw `<img src="/api/files/…">`,
because that request would not carry the access token.

## Horizontal scaling

| Concern         | Mechanism                                                   |
| --------------- | ----------------------------------------------------------- |
| HTTP            | Any instance; nginx `least_conn` in production compose      |
| WebSocket       | Each socket lives on one instance; events fan out via Redis |
| Auth sessions   | JWT + hashed refresh tokens in MongoDB                      |
| Presence        | Redis keys + Pub/Sub                                        |
| Rate limits     | Redis counters (`INCR` + `EXPIRE` in one Lua script)        |
| Message history | MongoDB                                                     |
| Files           | Local disk; shared volume between `api-1` and `api-2`       |

Adding an API replica does not require a Socket.IO adapter. It requires the
new process to use the same `REDIS_URL` and `MONGODB_URI`, a shared file
volume if using local storage, and a unique `APP_INSTANCE_ID` (the default
factory already does).

See [`docs/decisions/`](./decisions/) for why these choices were made.

## Observability

Production logs are JSON with `timestamp`, `level`, `event`, and request
context (`requestId`, `userId`, `roomId`, `messageId`, `duration`) when
those are known. Secrets and message content are stripped before a line is
written. Health probes live at `/health`, `/health/readiness`, and
`/health/liveness`.

See [`docs/observability.md`](./observability.md).
