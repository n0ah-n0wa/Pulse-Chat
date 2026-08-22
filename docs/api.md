# REST API

Conventions for the Pulse Chat HTTP API as implemented. OpenAPI is served
from `/api/docs` when `NODE_ENV` is not `production` (Nest Swagger, Bearer
auth). Treat this file and the Zod schemas in `@pulse-chat/shared` as the
contract; Swagger is generated from controller metadata and may be less
complete.

Global prefix: `/api`. Health probes are excluded from that prefix.

Resource ids in path parameters and bodies are 24-character hex MongoDB
ObjectIds unless noted (usernames, storage keys, emojis).

## Authentication

Protected routes require:

```http
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/register` or `POST /api/auth/login`.
Rotate them with `POST /api/auth/refresh` before the access token expires
(the web client does this automatically on `401`). Logout sends the
refresh token in the JSON body and does not require a Bearer header.

## Error format

```json
{
  "statusCode": 403,
  "code": "ROOM_ACCESS_DENIED",
  "message": "You do not have access to this room."
}
```

Every error includes an HTTP status, a machine-readable `code`, and a
human-readable `message` (`ApiException` / `ApiExceptionFilter`). Zod
failures use `VALIDATION_FAILED` (400). Unhandled exceptions use
`INTERNAL_ERROR` (500) without leaking stacks to the client.

Rate-limited endpoints return `429` with `code: "TOO_MANY_REQUESTS"`.
Limits are Redis-backed and shared across API instances; see
[`security.md`](./security.md).

## Headers

| Header             | Direction | Notes                                                                                   |
| ------------------ | --------- | --------------------------------------------------------------------------------------- |
| `Authorization`    | request   | `Bearer` access token on protected routes                                               |
| `X-Request-ID`     | both      | Client may send; API echoes a safe value (printable, max 128 chars) or generates a UUID |
| `X-Pulse-Instance` | response  | `APP_INSTANCE_ID` of the Nest process that handled the request                          |

## Pagination

List endpoints that page use **cursor pagination**, newest first:

| Query    | Meaning                                                |
| -------- | ------------------------------------------------------ |
| `limit`  | Page size (optional; see each route)                   |
| `before` | Exclusive cursor: id of the oldest item already loaded |

Pass `nextCursor` from the previous response as `before`. There is no
`offset` / `page` parameter.

## Public vs authenticated

| Auth                       | Routes                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| None                       | Auth register/login/refresh/logout; public user profiles and avatars; `/health*` |
| Bearer access token        | Everything else under `/api`, including file downloads                           |
| Refresh token in JSON body | `POST /api/auth/refresh`, `POST /api/auth/logout`                                |

---

## Auth — `/api/auth`

Rate-limited by client IP (`AuthRateLimitGuard`) except `GET /me`.

### `POST /api/auth/register` — `201`

Body (`registerSchema`):

| Field         | Rules                        |
| ------------- | ---------------------------- |
| `username`    | 3–32 chars, `[A-Za-z0-9_-]+` |
| `email`       | Valid email, max 254         |
| `password`    | 8–128 characters             |
| `displayName` | 1–64 characters              |

Response: `AuthSessionResponse` — `accessToken`, `refreshToken`,
`accessTokenExpiresIn` (seconds), `tokenType: "Bearer"`, `user`
(`CurrentUserProfile`, includes `email`).

Errors: `EMAIL_ALREADY_REGISTERED`, `USERNAME_ALREADY_TAKEN`,
`VALIDATION_FAILED`, `TOO_MANY_REQUESTS`.

### `POST /api/auth/login` — `200`

Body: `{ email, password }`. Response: `AuthSessionResponse`.

Unknown emails still run bcrypt against a dummy hash.
`INVALID_CREDENTIALS` (401) for bad email or password.

### `POST /api/auth/refresh` — `200`

Body: `{ refreshToken }`. Response: `AuthTokensResponse` (no `user`).

Reuse of a rotated token after a 10s grace window revokes the family
(`REFRESH_TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` depending on state).

### `POST /api/auth/logout` — `204`

Body: `{ refreshToken }`. Empty body. Idempotent if the token is already
gone.

### `GET /api/auth/me` — `200`

Bearer required. Returns `CurrentUserProfile`.

---

## Users — `/api/users`

### `GET /api/users/username/:username` — `200` (public)

Returns `PublicUserProfile` (no email). `USER_NOT_FOUND` if missing.

### `GET /api/users/:id` — `200` (public)

Same shape, by ObjectId.

### `GET /api/users/:id/avatar` — `200` (public)

Raw image bytes. `Content-Type` from stored metadata.
`Cache-Control: public, max-age=3600`. `USER_NOT_FOUND` / `FILE_NOT_FOUND`
when there is no avatar.

`avatarUrl` on profiles is `/api/users/:id/avatar` for locally stored
files.

### `PATCH /api/users/me` — `200` (auth)

Body: at least one of `displayName`, `username`, `bio` (bio max 500).
Returns `CurrentUserProfile`. `USERNAME_ALREADY_TAKEN` on collision.

### `POST /api/users/me/avatar` — `201` (auth)

`multipart/form-data` field `file`. Upload rate limit. Same type/size
rules as room attachments. Returns `CurrentUserProfile`.

---

## Rooms — `/api/rooms`

All routes require a Bearer token.

Room types: `PUBLIC`, `PRIVATE`, `DIRECT`. Roles: `OWNER`, `MODERATOR`,
`MEMBER`.

`GET /api/rooms` returns every **public** room plus every room the caller
belongs to (including private and direct), sorted by `updatedAt`
descending. Public rooms the caller has not joined omit
`currentUserRole`.

### `GET /api/rooms` — `200`

Array of `RoomResponse`.

### `POST /api/rooms` — `201`

| Type                 | Body                                                       |
| -------------------- | ---------------------------------------------------------- |
| `PUBLIC` / `PRIVATE` | `name` required (max 64); `description` optional (max 500) |
| `DIRECT`             | `peerUserId` required; `name` / `description` omitted      |

Creator becomes `OWNER` for public/private. Direct rooms use a stable
`directKey` for the unordered pair. A second create with the same peer
returns `409 DIRECT_ROOM_ALREADY_EXISTS` (including unique-index races).
If membership inserts fail after the room row is written, the room and
memberships are deleted (rollback). Both participants are stored as
`MEMBER` (there is no owner on a direct room).

### `GET /api/rooms/:id` — `200`

Public rooms are visible without membership. Private and direct rooms
require membership (`ROOM_ACCESS_DENIED`).

### `PATCH /api/rooms/:id` — `200`

At least one of `name`, `description`, `ownerId`. Direct rooms cannot be
updated (`INVALID_ROOM_OPERATION`).

| Field         | Who                                    |
| ------------- | -------------------------------------- |
| `name`        | Owner                                  |
| `description` | Moderator or owner                     |
| `ownerId`     | Owner; target must already be a member |

### `DELETE /api/rooms/:id` — `204`

Owner for public/private. Either participant may delete a direct room.
Removes memberships, deletes the room document, and evicts everyone from
Socket.IO rooms. Message history is not bulk-deleted here (orphaned
messages remain in MongoDB).

### `POST /api/rooms/:id/join` — `201`

Public rooms only, and only if not already a member. Returns
`RoomMemberResponse`. Private/direct: `CANNOT_JOIN_ROOM`.

### `POST /api/rooms/:id/leave` — `204`

- Direct: deletes the room and both memberships; evicts both users.
- Owner of a public/private room: `OWNER_CANNOT_LEAVE` while other
  members exist; if they are the last member, the room is deleted.
- Other members: membership removed; socket evicted.

### `GET /api/rooms/:id/members` — `200`

Caller must be a member. Array of `RoomMemberResponse`.

### `POST /api/rooms/:id/read` — `201`

Body: `{ messageId }`. Caller must be a member. The message must exist
in this room and must not be soft-deleted. Errors:
`MESSAGE_NOT_FOUND` if the id is unknown;
`INVALID_ROOM_OPERATION` if it belongs to another room or is deleted.
Returns the updated `RoomMemberResponse`.

### `POST /api/rooms/:id/members` — `201`

Moderator or owner; not allowed on direct rooms. Body:
`{ userId, role? }` where `role` is `MEMBER` (default) or `MODERATOR`
(owner only). Sends a `room_invitation` notification (failures are
logged, not returned). Eviction is not involved.

### `DELETE /api/rooms/:id/members/:userId` — `204`

Cannot remove yourself (use leave). Cannot remove the owner. Moderators
may remove `MEMBER` only. Evicts the target from Socket.IO rooms.

---

## Messages

List and create are nested under the room. Edit, delete, and reactions
use `/api/messages/:id`.

### `GET /api/rooms/:id/messages` — `200` (auth, member)

Query: `limit` (1–100, default 50), `before` (message id). Newest first.
Soft-deleted messages remain in the list with empty `content` and empty
`attachments`.

Response: `{ items, nextCursor? }`.

### `GET /api/rooms/:id/messages/search` — `200` (auth, member)

Query: `q` (1–200 chars, required), `limit`, `before`. Rate-limited.
MongoDB `$text` search on `(roomId, content)`; operators in the query
are quoted so they are literal. Soft-deleted messages are excluded.
Empty sanitized queries return an empty page.

Response: `{ items: [{ message, author, matchingContext }], nextCursor? }`.

### `POST /api/rooms/:id/messages` — `201` (auth, member)

Rate-limited (shared with WebSocket `message:send`).

```json
{
  "content": "See attached files",
  "clientMessageId": "client-unique-id",
  "replyToMessageId": "507f1f77bcf86cd799439041",
  "attachmentIds": ["507f1f77bcf86cd799439060"]
}
```

| Field              | Rules                                                                |
| ------------------ | -------------------------------------------------------------------- |
| `content`          | 1–4000 characters after trim                                         |
| `clientMessageId`  | 1–128; unique per `(room, author)` — duplicates return the original  |
| `replyToMessageId` | Optional; must be a message in the same room                         |
| `attachmentIds`    | Optional; max 10; must be unlinked uploads by this user in this room |

New messages are broadcast as `message:new`. Duplicate `clientMessageId`
does not broadcast again.

`@username` tokens (not emails, not ObjectIds, min username length) create
`mention` notifications for current members other than the author. Replies
create `reply` notifications. Direct rooms create `direct_message` for the
peer. Notification write failures are logged and do not fail the request.

### `PATCH /api/messages/:id` — `200`

Body: `{ content }`. Author, or moderator/owner. Broadcasts
`message:updated`. Soft-deleted messages: `MESSAGE_ALREADY_DELETED`.

### `DELETE /api/messages/:id` — `204`

Same permission as edit. Soft-delete (`deletedAt`). Broadcasts
`message:deleted`. Original content remains in MongoDB; API responses
redact `content` and `attachments`.

### `POST /api/messages/:id/reactions` — `201`

Body: `{ emoji }` (1–32 chars after trim). **Toggle**: if the user already
reacted with that emoji, it is removed and `reaction:removed` is
broadcast; otherwise it is added and `reaction:added` is broadcast.
Returns the full `MessageResponse`.

### `DELETE /api/messages/:id/reactions/:emoji` — `200`

Removes that emoji for the caller only. Broadcasts `reaction:removed`.
Returns `MessageResponse`.

---

## Attachments

Binary files are stored on local disk (`FILE_STORAGE_PATH`). Messages
reference attachments by id; upload responses and message payloads
include metadata and a download URL under `/api/files/<key>`.

There is **no** S3 provider and **no** presigned URL. Setting
`FILE_STORAGE_PROVIDER=s3` prevents the API from starting.

### `POST /api/rooms/:roomId/attachments` — `201`

`Content-Type: multipart/form-data`, field `file`. Member. Upload rate
limit.

Validation:

- Maximum size: 10 MiB
- Types from magic bytes: JPEG, PNG, GIF, WebP, PDF, plain text
- Storage key: server UUID + detected extension

Response `AttachmentResponse`:

```json
{
  "id": "507f1f77bcf86cd799439060",
  "filename": "screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 512,
  "url": "/api/files/<uuid>.png",
  "createdAt": "2026-08-20T00:00:00.000Z"
}
```

| Code                | When                                 |
| ------------------- | ------------------------------------ |
| `FILE_TOO_LARGE`    | Exceeds 10 MiB                       |
| `INVALID_FILE_TYPE` | Content not allowed or empty         |
| `INVALID_FILENAME`  | Filename unusable after sanitization |
| `NOT_A_MEMBER`      | Caller is not a room member          |

Link attachments by passing their ids on message create (REST or
`message:send`). Errors then: `ATTACHMENT_NOT_FOUND`,
`ATTACHMENT_ACCESS_DENIED`, `ATTACHMENT_ALREADY_LINKED`,
`ATTACHMENT_LIMIT_EXCEEDED`.

### `GET /api/files/:key` — `200`

Bearer required. Caller must be a member of the room that owns the
attachment. Returns file bytes, `Content-Type` from stored metadata, and
`Content-Disposition` (`inline` for images, `attachment` for PDF/text).

The SPA must not use this URL as a naked `src`/`href`; it fetches with
the access token and uses a blob URL.

### `DELETE /api/attachments/:id` — `204`

- Unlinked upload: uploader only
- Linked to a message: same rules as message delete (author, moderator,
  owner)

Removes the file from disk and soft-deletes metadata. If linked, the id
is pulled off the message.

---

## Notifications — `/api/notifications`

Bearer required. Newest first. Types: `mention`, `reply`,
`direct_message`, `room_invitation`.

### `GET /api/notifications` — `200`

Query: `limit` (1–50, default 20), `before` (notification id). Response:
`{ items, nextCursor? }` of `NotificationResponse`.

### `POST /api/notifications/:id/read` — `200`

Marks that notification read if it belongs to the caller.
`NOTIFICATION_NOT_FOUND` otherwise. Returns the updated
`NotificationResponse`.

### `POST /api/notifications/read-all` — `204`

Marks all of the caller's notifications read.

New notifications are also pushed as Socket.IO `notification:new` to
`user:{userId}`.

---

## Health

These routes are **outside** `/api` so probes are not mixed with the
product API. They do not require auth.

| Method | Path                | Status                                                                                                |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/health`           | Always **200**; body `{ status, checks: { mongodb, redis } }` where each check is `"ok"` or `"error"` |
| GET    | `/health/readiness` | Same body; **503** when either dependency fails                                                       |
| GET    | `/health/liveness`  | **200** `{ "status": "ok" }` with no Mongo/Redis I/O                                                  |

Production nginx proxies `/health`. Development nginx does **not**; call
the API container/port directly for probes in that topology.

See [`observability.md`](./observability.md).

---

## Selected error codes

Cross-cutting: `VALIDATION_FAILED`, `BAD_REQUEST`, `NOT_FOUND`,
`UNAUTHORIZED`, `FORBIDDEN`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`.

Auth: `INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`,
`USERNAME_ALREADY_TAKEN`, `INVALID_REFRESH_TOKEN`,
`REFRESH_TOKEN_REVOKED`, `TOKEN_EXPIRED`.

Rooms: `ROOM_NOT_FOUND`, `ROOM_ACCESS_DENIED`, `INSUFFICIENT_ROOM_ROLE`,
`ALREADY_A_MEMBER`, `NOT_A_MEMBER`, `MEMBER_NOT_FOUND`, `CANNOT_JOIN_ROOM`,
`OWNER_CANNOT_LEAVE`, `CANNOT_REMOVE_OWNER`, `DIRECT_ROOM_ALREADY_EXISTS`,
`INVALID_ROOM_OPERATION`, …

Messages: `MESSAGE_NOT_FOUND`, `INVALID_MESSAGE_CURSOR`,
`MESSAGE_ALREADY_DELETED`, `INVALID_REPLY_REFERENCE`.

The full enumerations live in `@pulse-chat/shared`.
