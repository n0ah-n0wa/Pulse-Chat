# WebSocket events

Realtime transport is Socket.IO on path `/socket.io`, **websocket-only**
(`transports: ['websocket']`; Engine.IO HTTP long-polling is disabled).
Authentication uses the same access JWT as REST. Nginx upgrades the
connection; multiple API processes share events over Redis Pub/Sub. See
[`architecture.md`](./architecture.md).

## Handshake

The client sends the access token as Socket.IO handshake auth:

```json
{ "token": "<access_token>" }
```

The API also accepts `Authorization: Bearer <access_token>` on the
handshake request. Missing, expired, or invalid tokens fail the handshake
with Socket.IO `connect_error`. Expired tokens use `code: "TOKEN_EXPIRED"`
on `error.data`; other auth failures use `UNAUTHORIZED`.

CORS for Socket.IO is pinned to the same `CORS_ORIGIN` as HTTP
(`CorsIoAdapter`). Credentials are allowed.

After connect, the gateway:

1. Registers the socket and joins the personal room `user:{userId}`
   (used for `notification:new`).
2. Records presence in Redis and may publish `user:online`.
3. Does **not** auto-join chat rooms. The client must emit `room:join` for
   each room it wants to receive.

Application errors after connect use the `error` event:

```json
{ "code": "UNAUTHORIZED", "message": "..." }
```

The same `code` values as REST (`TOO_MANY_REQUESTS`, `NOT_A_MEMBER`, …)
appear on `error` for `message:send` and typing.

Successful `room:join`, `room:leave`, and `message:send` are logged as
`ws.event`. Typing successes are not logged. Failures emit `ws.event_failed`.

Canonical TypeScript contracts live in `@pulse-chat/shared`
(`CLIENT_SOCKET_EVENTS`, `SERVER_SOCKET_EVENTS`, `ClientToServerEvents`,
`ServerToClientEvents`, and the Zod schemas in `realtime-validation.ts`).

## Client → server

| Event          | Payload                                                                   | Authorization        |
| -------------- | ------------------------------------------------------------------------- | -------------------- |
| `room:join`    | `{ roomId }`                                                              | Member of the room   |
| `room:leave`   | `{ roomId }`                                                              | Authenticated        |
| `message:send` | `{ roomId, content, clientMessageId, replyToMessageId?, attachmentIds? }` | Member; rate-limited |
| `typing:start` | `{ roomId }`                                                              | Member; rate-limited |
| `typing:stop`  | `{ roomId }`                                                              | Member; rate-limited |

`message:send` is the same Zod schema as REST `POST /api/rooms/:id/messages`
plus `roomId` (`createMessageSchema` extended). Optional fields:

- `replyToMessageId` — 24-character hex id of a message in the same room
- `attachmentIds` — up to 10 ids previously uploaded to that room by the
  same user and not yet linked

`clientMessageId` is idempotent per `(roomId, authorId)`. A duplicate
returns the existing message and does **not** republish `message:new`.

Edits, deletes, reactions, and read-state updates are REST only
(`PATCH` / `DELETE /api/messages/:id`, `POST /api/rooms/:id/read`).

### `room:join` behaviour

Membership is checked with `RoomsService.requireMember`. Join is
idempotent: if `socket.rooms` already contains `roomId`, the server skips
`socket.join` and the subscription refcount, but still emits `room:joined`
with fresh room state and a presence snapshot.

On a first join, other sockets in the room receive `user:online` for the
joiner (`socket.to(roomId)`).

### `room:leave` behaviour

Client-initiated leave always emits `room:left` to that socket. It does
not check membership (you can leave a Socket.IO room you are no longer a
member of). REST leave/remove/delete also force `room:left` via membership
eviction (see below).

## Server → client

| Event              | Payload                              | Fan-out                                                             |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------- |
| `room:joined`      | `{ roomId, room }`                   | Joining socket                                                      |
| `room:left`        | `{ roomId }`                         | Leaving socket, including REST eviction                             |
| `message:new`      | `{ message }`                        | Socket.IO room + Redis `pulse:realtime:message`                     |
| `message:updated`  | `{ message }`                        | Same                                                                |
| `message:deleted`  | `{ message }`                        | Same                                                                |
| `reaction:added`   | `{ roomId, message, emoji, userId }` | Redis `pulse:realtime:reaction`                                     |
| `reaction:removed` | `{ roomId, message, emoji, userId }` | Same                                                                |
| `user:online`      | `{ userId, lastSeenAt }`             | All sockets on each instance + Redis `pulse:realtime:presence`      |
| `user:offline`     | `{ userId, lastSeenAt }`             | Same                                                                |
| `notification:new` | `{ notification }`                   | Personal `user:{userId}` room + Redis `pulse:realtime:notification` |
| `typing:started`   | `{ roomId, userId }`                 | Other sockets in the room + Redis `pulse:realtime:typing`           |
| `typing:stopped`   | `{ roomId, userId }`                 | Same                                                                |
| `error`            | `{ code, message }`                  | Requesting socket                                                   |

Presence is not room-scoped (every authenticated connection sees
online/offline transitions). Typing is room-scoped and ephemeral; it is
not stored in MongoDB. The origin connection uses `socket.to(roomId)`, so
the typer does not receive their own typing events. The server does not
expire typing; the SPA hides indicators after `TYPING_TIMEOUT_MS` (1500).

`message` payloads are the same `MessageResponse` as REST (including
`attachments` and `reactions`). Soft-deleted messages have empty `content`
and an empty `attachments` array.

## Internal bus events (not sent to browsers)

| Event                     | Channel                     | Effect on a remote instance                                       |
| ------------------------- | --------------------------- | ----------------------------------------------------------------- |
| `internal:member-removed` | `pulse:realtime:membership` | Leave `roomId` on that user's sockets and emit client `room:left` |

REST `POST /api/rooms/:id/leave`, `DELETE /api/rooms/:id/members/:userId`,
and `DELETE /api/rooms/:id` publish this after membership is removed so a
socket on another API process cannot keep receiving room traffic.

## Envelope (Redis)

```json
{
  "version": 1,
  "event": "message:new",
  "originInstanceId": "hostname:pid:uuid",
  "occurredAt": "2026-08-18T12:00:00.000Z",
  "roomId": "…",
  "userId": "…",
  "payload": {}
}
```

`event` is one of the distributed names in
`DISTRIBUTED_REALTIME_EVENTS` (`message:new`, `reaction:added`,
`user:online`, `internal:member-removed`, …). The originating instance
ignores envelopes with its own `originInstanceId` so local clients are not
double-emitted.

Invalid JSON or schema-invalid envelopes are dropped.

## Client implementation notes

`apps/web/src/services/socket-service.ts`:

- Connects with `auth: { token }` and `transports: ['websocket']`.
- Reconnects indefinitely (500 ms–5 s backoff).
- Reference-counts `room:join` / `room:leave`.
- On access-token rotation, drops the transport but **keeps room
  refcounts** so rooms are re-joined after the new handshake.
- Full `disconnect()` (logout) clears refcounts.
