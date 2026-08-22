# ADR-008: HS256 JWTs with hashed refresh families in MongoDB

- Status: Accepted
- Date: 2026-08-22

## Context

The SPA is a first-party browser client behind one origin. Sessions must
survive access-token expiry (minutes) without storing server-side
session blobs in Redis (Redis is ephemeral — ADR-007). Stolen refresh
tokens should be detectable. Access tokens must not be usable as
refresh tokens.

Passport was not required for a single JWT strategy.

## Decision

- Access and refresh JWTs use **HS256** with separate secrets and a
  `type` claim. Verify calls pass `algorithms: ['HS256']`.
- Access tokens are stateless (`sub`, `role`, `type`). `role` is not
  used for authorization (`ADMIN` is unused).
- Refresh tokens carry `jti` and `familyId`. Only the SHA-256 hash is
  stored in MongoDB. Rotation claims `jti` atomically; reuse after a
  10s grace window revokes the family.
- Logout revokes the presented refresh hash. Access tokens live until
  expiry.
- The SPA keeps both tokens in `localStorage` and sends Bearer headers.
  There are no HttpOnly cookies and no CSRF tokens.

Production refuses short/missing secrets. Development may use documented
insecure placeholders.

## Alternatives considered

- **Sessions in Redis.** Conflicts with ephemeral Redis; a restart would
  sign everyone out or require persisting Redis (ADR-007).
- **HttpOnly cookie for refresh.** Smaller XSS impact; needs CSRF,
  cookie flags, and a different SPA client. Not implemented.
- **Asymmetric JWT (RS256).** Better for multi-service verify-only;
  this repo has one API and two HMAC secrets are enough.
- **Passport.** Extra abstraction for one custom `AuthGuard`.

## Consequences

- XSS can steal tokens until CSP and React text rendering hold.
- Logout cannot instantly kill access tokens; the window is the access
  TTL (default 15 minutes).
- Multi-device login is multiple families; login does not revoke other
  devices.
