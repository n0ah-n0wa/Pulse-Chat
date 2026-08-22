# Security model

This page records the threat model from specification sections 33, 34 and 64
and the controls that **this repository actually implements**. Planned
controls (HttpOnly refresh cookies, S3, TLS on compose) are called out as
absent.

## Authentication

Passwords are hashed with bcrypt (cost 12). Login always performs a
comparison, including against a dummy hash when the email is unknown, so
account existence is not leaked through timing.

Access and refresh tokens are HS256 JWTs with separate secrets, an
explicit algorithm allowlist (`algorithms: ['HS256']`), and a `type`
claim (`access` vs `refresh`) so the two cannot be swapped. Production
startup refuses missing or short secrets (minimum 32 characters).
Development and test fill in well-known insecure placeholders when the
env vars are blank.

| Token   | Payload                                     | Default lifetime |
| ------- | ------------------------------------------- | ---------------- |
| Access  | `sub`, `role`, `type: "access"`             | `15m`            |
| Refresh | `sub`, `jti`, `familyId`, `type: "refresh"` | `30d`            |

`role` on the access token is stored but **not used for authorization**.
Users may have `USER` or `ADMIN` in MongoDB; no route grants extra rights
from `ADMIN`.

Refresh tokens are stored as SHA-256 hashes in the `refresh_tokens`
collection. Rotation claims the current `jti` atomically, then issues a
new token in the same family. Presenting an already rotated token after a
10 second grace window (`REFRESH_REUSE_GRACE_MS`) revokes the whole
family (theft detection). Concurrent refresh of the same token inside
that window is treated as a lost race: the losing request is rejected,
but the newly issued token remains valid.

Logout revokes the presented refresh token. It does **not** require a
Bearer access token. Access tokens remain valid until expiry (they are
stateless). Login and registration create a new family and do not revoke
other devices.

The SPA stores both tokens in `localStorage` (`pulse-chat-auth`). Logout
bumps a session generation counter so an in-flight `POST /api/auth/refresh`
cannot write tokens back after sign-out. Concurrent REST `401`s share one
refresh (single-flight).

There is no Passport, no cookie session, and no CSRF token. CORS is a
single origin with credentials enabled; the product is designed to run
behind one nginx origin so the browser does not make cross-origin API
calls in the compose topologies.

## Authorization

Room membership is checked before listing, sending, editing or deleting
messages, joining a Socket.IO room, uploading or downloading
attachments, searching, and marking a room read. Mentions and replies
only notify users who currently belong to the room. Notification
mark-read is scoped to the authenticated user.

Membership roles (`OWNER` / `MODERATOR` / `MEMBER`) gate room settings
and member management. See [`api.md`](./api.md) for the per-route rules.

When membership ends (leave, remove, or room delete), the API evicts
that user's Socket.IO rooms locally and publishes
`internal:member-removed` so other API processes do the same. The client
receives `room:left`.

Public without a Bearer token:

- `POST /api/auth/register`, `login`, `refresh`, `logout`
- `GET /api/users/:id`, `GET /api/users/username/:username`
- `GET /api/users/:id/avatar`
- `/health`, `/health/readiness`, `/health/liveness`

Everything else under `/api` requires `Authorization: Bearer`. That
includes `GET /api/files/:key`: attachment URLs are not anonymous. The
SPA fetches them with the access token and displays blob URLs.

Avatars are public downloads (`Cache-Control: public, max-age=3600`).

## Rate limiting

Every API process shares Redis fixed-window counters. Incrementing a key
is atomic (Lua `INCR` plus `EXPIRE` only when the key is created), so two
Nest instances cannot grant a client twice the configured budget, and a
crash cannot leave a counter without a TTL.

Limits are configured with environment variables. Defaults:

| Traffic                                                               | Subject            | Default  | Variables                                                   |
| --------------------------------------------------------------------- | ------------------ | -------- | ----------------------------------------------------------- |
| `POST /api/auth/login`                                                | client IP          | 5 / 60s  | `RATE_LIMIT_LOGIN`, `RATE_LIMIT_AUTH_WINDOW_SECONDS`        |
| `POST /api/auth/register`                                             | client IP          | 5 / 60s  | `RATE_LIMIT_REGISTER`, `RATE_LIMIT_AUTH_WINDOW_SECONDS`     |
| `POST /api/auth/refresh` and `POST /api/auth/logout`                  | client IP          | 5 / 60s  | `RATE_LIMIT_LOGIN`, `RATE_LIMIT_AUTH_WINDOW_SECONDS`        |
| `POST /api/rooms/:id/messages` and WebSocket `message:send`           | authenticated user | 20 / 10s | `RATE_LIMIT_MESSAGES`, `RATE_LIMIT_MESSAGES_WINDOW_SECONDS` |
| WebSocket `typing:start` / `typing:stop`                              | authenticated user | 20 / 10s | `RATE_LIMIT_MESSAGES`, `RATE_LIMIT_MESSAGES_WINDOW_SECONDS` |
| `GET /api/rooms/:id/messages/search`                                  | authenticated user | 30 / 60s | `RATE_LIMIT_SEARCH`, `RATE_LIMIT_SEARCH_WINDOW_SECONDS`     |
| `POST /api/rooms/:roomId/attachments` and `POST /api/users/me/avatar` | authenticated user | 10 / 60s | `RATE_LIMIT_UPLOADS`, `RATE_LIMIT_UPLOADS_WINDOW_SECONDS`   |

Refresh and logout share the login **numeric** policy but use separate
Redis keys (`rate-limit:auth:refresh:<ip>` vs
`rate-limit:auth:login:<ip>`), so a refresh storm does not lock out login
and vice versa. Typing uses the message numeric policy with
`rate-limit:typing:user:<userId>` so it cannot consume the send budget
(`rate-limit:messages:user:<userId>`).

HTTP and WebSocket message sends share one per-user bucket so a client
cannot double its send rate by using both transports.

Behind nginx, `trust proxy` is `1` so login and registration keys use the
forwarded client address. Development and production nginx set
`X-Forwarded-For` to `$remote_addr` (they overwrite the client-supplied
header).

### Error shape

Over-limit requests use the same body as every other API error:

```json
{
  "statusCode": 429,
  "code": "TOO_MANY_REQUESTS",
  "message": "Too many requests. Please try again later."
}
```

WebSocket `message:send` and typing events emit `error` with the same
`code` and `message` (no HTTP status).

Development Redis runs without persistence, so a Redis restart clears
the windows. Production Redis is also configured without RDB/AOF.

See `.env.example` for the full variable list.

## Uploads

Allowed types are detected from file bytes (magic signatures in
`detect-content-type.ts`), not the client `Content-Type`. SVG is rejected. Empty files are rejected. Filenames are
sanitized for display only; storage keys are server-generated
`<uuid>.<extension>` matching `STORAGE_KEY_PATTERN`. Downloads require
room membership, a Bearer token, and a key that matches that pattern.
Images are served `Content-Disposition: inline`; PDF and text files are
`attachment`.

Maximum size is 10 MiB (`ATTACHMENT_MAX_BYTES`), aligned with nginx
`client_max_body_size 10m` and the API JSON body parser limit.

There is no S3 adapter and no presigned URL path.

## Transport

HTTP CORS is a single configured origin. Socket.IO uses the same origin.
Helmet sets security headers on the API. In non-production, Helmet CSP is
disabled so Swagger UI can load. The production SPA nginx config
(`infrastructure/nginx/security-headers.conf`) adds
Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy`. That CSP allows `img-src`
`blob:` so authenticated media previews work.

JSON bodies are capped at 10 MiB.

Development MongoDB and Redis have no credentials and are bound to
loopback only. Production compose enables MongoDB auth and Redis
`requirepass` and does not publish those ports to the host.

Compose does not terminate TLS. Do not expose `:8080` beyond localhost
without a TLS-terminating proxy.

## Frontend

Message content, usernames and notifications are rendered as React text,
not HTML. Post-login redirects accept only same-origin relative paths
(`safeInternalPath`).

Session tokens in `localStorage` remain a residual XSS risk; CSP on the
production SPA is the compensating control. Moving refresh tokens to
HttpOnly cookies would be a different authentication strategy, not a
small change.

The landing page `/` is public. `/app` and `/settings` require a persisted
session (`ProtectedRoute`).
