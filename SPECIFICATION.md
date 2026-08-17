# Pulse Chat
## Full Technical Specification & AI-First Development Specification

**Version:** 1.0  
**Status:** Development Specification  
**Primary Goal:** Production-quality portfolio project  
**Development Model:** AI-first development with Cursor  
**Language:** TypeScript across the entire application stack

---

# 1. Project Overview

## 1.1 Product

Pulse Chat is a modern real-time communication platform designed around persistent chat rooms, real-time messaging, presence, typing indicators, message history, and scalable WebSocket communication.

The application must demonstrate production-oriented full-stack engineering practices rather than simply provide a functional chat interface.

The system must include:

- user authentication;
- user profiles;
- public and private chat rooms;
- room membership and permissions;
- real-time messaging;
- persistent message history;
- message editing and soft deletion;
- typing indicators;
- online/offline presence;
- unread message tracking;
- message reactions;
- replies;
- mentions;
- file and image attachments;
- message search;
- notifications;
- responsive UI;
- Redis-backed ephemeral state;
- Redis Pub/Sub for distributed real-time events;
- horizontal WebSocket scalability;
- MongoDB persistence;
- Docker-based development and deployment;
- automated testing;
- CI/CD;
- health checks;
- structured logging;
- API documentation.

The application should feel similar in conceptual scope to a lightweight combination of Slack and Discord, while remaining intentionally smaller and easier to understand.

---

# 2. Product Principles

The following principles are mandatory.

## 2.1 Simplicity

Do not introduce infrastructure or abstractions unless they solve an actual problem.

## 2.2 Type Safety

TypeScript must be used consistently across frontend and backend.

Avoid:

```typescript
any
```

unless there is a documented technical reason.

Prefer:

```typescript
unknown
```

with explicit validation.

## 2.3 Explicit Architecture

Business logic must not be hidden inside controllers, React components, or WebSocket handlers.

Use clear separation between:

- transport;
- application logic;
- persistence;
- infrastructure;
- presentation.

## 2.4 Production-Oriented Defaults

Security, validation, logging, error handling, testing, and graceful failure must be considered first-class features.

## 2.5 AI-Friendly Codebase

The project must be structured so that an AI coding agent can safely modify individual components without needing to understand the entire codebase every time.

Prefer:

- small modules;
- explicit interfaces;
- predictable naming;
- low coupling;
- clear dependency boundaries;
- typed contracts;
- documentation close to complex logic.

---

# 3. Technology Stack

## 3.1 Frontend

- React
- TypeScript
- Vite
- React Router
- Zustand
- TanStack Query
- Socket.IO Client
- React Hook Form
- Zod
- Tailwind CSS
- Vitest
- React Testing Library

## 3.2 Backend

- NestJS
- TypeScript
- Socket.IO
- Passport
- JWT
- Zod or class-validator for request validation
- Mongoose

## 3.3 Data Layer

- MongoDB
- Redis

## 3.4 Infrastructure

- Docker
- Docker Compose
- Nginx
- GitHub Actions

## 3.5 Documentation

- OpenAPI / Swagger
- Markdown architecture documentation

---

# 4. High-Level Architecture

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         │                     │
                         │ React + TypeScript  │
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
                 │               │     │               │
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
                    │             │   │             │
                    │ Presence    │   │ Users       │
                    │ Pub/Sub     │   │ Rooms       │
                    │ Sessions    │   │ Messages    │
                    │ Rate limits │   │ Reactions   │
                    └─────────────┘   │ Attachments │
                                      └─────────────┘
```

The architecture must support running multiple NestJS instances simultaneously.

---

# 5. Repository Structure

Use a monorepo.

```text
pulse-chat/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── shared/
│   ├── config/
│   └── eslint-config/
│
├── infrastructure/
│   ├── nginx/
│   └── docker/
│
├── docs/
│   ├── architecture.md
│   ├── websocket-events.md
│   ├── api.md
│   ├── security.md
│   └── decisions/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── package.json
├── README.md
└── SPECIFICATION.md
```

Use npm workspaces, pnpm workspaces, or Turborepo.

Prefer **pnpm + Turborepo** if there is no technical reason to avoid it.

---

# 6. Domain Model

The primary entities are:

- User
- Session
- Room
- RoomMember
- Message
- Reaction
- Attachment
- Notification
- RefreshToken / authentication session
- ReadState

---

# 7. User Model

```typescript
User {
    id: string
    username: string
    email: string
    passwordHash: string

    displayName: string
    avatarUrl?: string
    bio?: string

    role: "USER" | "ADMIN"

    createdAt: Date
    updatedAt: Date
    lastSeenAt?: Date
}
```

Constraints:

- email must be unique;
- username must be unique;
- username length: 3–32 characters;
- username may contain letters, numbers, `_` and `-`;
- password must never be stored in plaintext.

---

# 8. Authentication

Implement:

- registration;
- login;
- logout;
- access tokens;
- refresh tokens;
- token rotation;
- password hashing;
- current-user endpoint.

Use:

```text
short-lived access token
+
long-lived refresh token
```

Refresh tokens must be revocable.

Never store raw refresh tokens if avoidable. Store a secure hash or token identifier.

---

# 9. Authorization

Roles:

```text
USER
ADMIN
```

Room-level permissions:

```text
OWNER
MODERATOR
MEMBER
```

Users can:

### MEMBER

- read room messages;
- send messages;
- edit own messages;
- delete own messages;
- react to messages;
- reply;
- leave room.

### MODERATOR

Everything above plus:

- remove members;
- delete messages;
- manage room settings.

### OWNER

Everything above plus:

- rename room;
- change description;
- manage moderators;
- delete room;
- transfer ownership.

---

# 10. Rooms

Room types:

```text
PUBLIC
PRIVATE
DIRECT
```

## Public room

Visible to all users.

## Private room

Visible only to members.

## Direct room

One-to-one conversation between two users.

Room model:

```typescript
Room {
    id: string

    name?: string
    description?: string

    type: "PUBLIC" | "PRIVATE" | "DIRECT"

    ownerId?: string

    createdAt: Date
    updatedAt: Date
}
```

For direct rooms, enforce exactly two participants.

---

# 11. Room Membership

Do not embed large member arrays directly inside rooms.

Use a dedicated membership collection.

```typescript
RoomMember {
    id: string
    roomId: string
    userId: string

    role: "OWNER" | "MODERATOR" | "MEMBER"

    joinedAt: Date
    lastReadMessageId?: string
    lastReadAt?: Date
}
```

Create a compound unique index:

```text
(roomId, userId)
```

---

# 12. Messages

```typescript
Message {
    id: string

    roomId: string
    authorId: string

    content: string

    replyToMessageId?: string

    attachments: AttachmentReference[]

    editedAt?: Date
    deletedAt?: Date

    createdAt: Date
    updatedAt: Date
}
```

Messages must use soft deletion.

Deleted messages must retain their ID and metadata.

Frontend representation:

```text
This message was deleted
```

---

# 13. Message Validation

Maximum message length:

```text
4000 characters
```

Reject:

- empty messages;
- messages containing only whitespace;
- oversized payloads;
- malformed data.

Normalize input where appropriate.

Never trust frontend validation.

All validation must also happen server-side.

---

# 14. Message Editing

Users may edit their own messages.

Moderators may edit/delete messages according to permissions.

Edited messages must contain:

```typescript
editedAt
```

Frontend:

```text
Hello everyone! (edited)
```

Do not maintain unlimited message edit history in the initial implementation.

---

# 15. Message Reactions

Support emoji reactions.

Example:

```typescript
Reaction {
    messageId: string
    userId: string
    emoji: string
    createdAt: Date
}
```

Compound unique constraint:

```text
(messageId, userId, emoji)
```

Users can toggle reactions.

---

# 16. Replies

Messages can reference another message:

```text
replyToMessageId
```

Frontend:

```text
┌───────────────────────────────┐
│ ↳ Alex: Original message      │
│                               │
│ My reply                      │
└───────────────────────────────┘
```

Clicking the referenced message should scroll to it.

---

# 17. Mentions

Support:

```text
@username
```

The backend should parse mentions when a message is created.

Mentioned users should receive a notification.

Example:

```text
Dmytro mentioned you in #developers
```

---

# 18. Attachments

Support:

- images;
- common documents.

Do not store binary files directly in MongoDB.

Use an abstract storage interface:

```typescript
interface FileStorage {
    upload(...)
    delete(...)
    getUrl(...)
}
```

The initial implementation may use local filesystem storage or S3-compatible object storage.

The architecture must allow replacing the storage provider without modifying message business logic.

Validate:

- MIME type;
- file size;
- filename;
- extension.

Never trust client-provided MIME information alone.

---

# 19. Message Search

Implement search within a room.

Example:

```text
GET /rooms/:roomId/messages/search?q=deployment
```

Search should return:

- message;
- author;
- timestamp;
- matching context.

Use MongoDB text indexes or an appropriate MongoDB search mechanism.

Do not introduce Elasticsearch/OpenSearch unless clearly justified.

---

# 20. Message Pagination

Messages must use cursor-based pagination.

Example:

```text
GET /rooms/:roomId/messages?limit=50&before=<cursor>
```

Do not use offset pagination for message history.

Default:

```text
limit = 50
max = 100
```

Messages are ordered newest-first at API level but displayed oldest-to-newest in the UI.

---

# 21. Real-Time Architecture

Use Socket.IO.

Connection:

```text
/socket.io
```

Every socket connection must be authenticated.

Authentication may use:

- access token during handshake;
- secure cookie if appropriate.

Unauthenticated WebSocket connections must be rejected.

---

# 22. WebSocket Events

## Client → Server

```text
room:join
room:leave

message:send
message:edit
message:delete

typing:start
typing:stop

reaction:add
reaction:remove

message:read
```

## Server → Client

```text
room:joined
room:left

message:new
message:updated
message:deleted

typing:started
typing:stopped

reaction:added
reaction:removed

user:online
user:offline

notification:new

error
```

Every event must have a documented payload schema.

See:

```text
docs/websocket-events.md
```

---

# 23. WebSocket Event Contract

Example:

```typescript
interface MessageCreatedEvent {
    message: {
        id: string
        roomId: string
        authorId: string
        content: string
        createdAt: string
    }
}
```

Event payloads must be versionable.

Avoid sending entire database documents directly over WebSocket.

Use dedicated DTOs.

---

# 24. Room Subscription

When a client joins a room:

```text
socket.join(roomId)
```

Before joining:

1. authenticate user;
2. verify room exists;
3. verify user has access;
4. join Socket.IO room;
5. return room state.

Users must never be able to subscribe to arbitrary room IDs without authorization.

---

# 25. Redis Presence

Redis is responsible for ephemeral presence.

Suggested structure:

```text
presence:user:<userId>
```

Store:

```text
status
lastSeen
instanceId
```

Use TTL.

Presence must automatically expire if a client disappears unexpectedly.

Do not rely exclusively on WebSocket disconnect events.

---

# 26. Multi-Instance Presence

A user may have multiple active sockets.

Example:

```text
User
 ├── desktop
 ├── laptop
 └── mobile
```

The user is considered online while at least one valid connection remains.

Presence implementation must therefore track connection count or individual socket/session keys.

---

# 27. Redis Pub/Sub

Use Redis Pub/Sub to propagate events between NestJS instances.

Example:

```text
Instance A
    │
    │ publish
    ▼
Redis
    │
    │ subscribe
    ▼
Instance B
```

Required distributed events:

- new message;
- edited message;
- deleted message;
- reaction;
- presence updates;
- typing events where appropriate.

The implementation must work correctly with at least two backend instances.

---

# 28. Typing Indicators

Typing events are ephemeral.

Do not persist typing events.

Frontend must debounce typing events.

Example behavior:

```text
User starts typing
    ↓
typing:start

No input for 1.5 seconds
    ↓
typing:stop
```

A typing indicator should automatically expire on the server/client after a timeout.

---

# 29. Read State

Each room membership maintains:

```text
lastReadMessageId
lastReadAt
```

When the user opens a room and reaches the latest messages:

```text
message:read
```

Update read state.

Use this to calculate unread counts.

---

# 30. Notifications

Notifications should support:

- mentions;
- direct messages;
- room invitations;
- replies.

Notification model:

```typescript
Notification {
    id: string
    userId: string

    type:
        | "MENTION"
        | "DIRECT_MESSAGE"
        | "ROOM_INVITE"
        | "REPLY"

    referenceId: string

    readAt?: Date

    createdAt: Date
}
```

Unread notifications must be available through REST.

New notifications should also arrive via WebSocket.

---

# 31. REST API

Base URL:

```text
/api
```

## Authentication

```text
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
```

## Users

```text
GET    /users/:id
PATCH  /users/me
POST   /users/me/avatar
```

## Rooms

```text
GET    /rooms
POST   /rooms

GET    /rooms/:id
PATCH  /rooms/:id
DELETE /rooms/:id

POST   /rooms/:id/join
POST   /rooms/:id/leave

GET    /rooms/:id/members
POST   /rooms/:id/members
DELETE /rooms/:id/members/:userId
```

## Messages

```text
GET    /rooms/:id/messages
GET    /rooms/:id/messages/search

POST   /rooms/:id/messages
PATCH  /messages/:id
DELETE /messages/:id

POST   /messages/:id/reactions
DELETE /messages/:id/reactions/:emoji
```

## Notifications

```text
GET    /notifications
POST   /notifications/:id/read
POST   /notifications/read-all
```

---

# 32. Error Handling

Use consistent API errors.

Example:

```json
{
    "statusCode": 403,
    "code": "ROOM_ACCESS_DENIED",
    "message": "You do not have access to this room."
}
```

Every error should have:

- HTTP status;
- machine-readable code;
- human-readable message.

Do not expose internal stack traces to clients.

---

# 33. Rate Limiting

Implement rate limiting for:

- login;
- registration;
- message sending;
- search;
- file uploads;
- WebSocket message events.

Example conceptual limits:

```text
Login:
5 attempts / minute / IP

Messages:
20 messages / 10 seconds / user

Search:
30 requests / minute / user
```

Exact values should be configurable through environment variables.

Redis should be used for distributed rate limiting.

---

# 34. Security

Mandatory:

- password hashing with Argon2 or bcrypt;
- JWT validation;
- refresh token rotation;
- request validation;
- authorization guards;
- rate limiting;
- CORS configuration;
- Helmet/security headers;
- payload size limits;
- file validation;
- MongoDB injection protection;
- XSS-safe message rendering;
- no secrets in source control.

Never render message content using unsafe HTML injection unless sanitized.

---

# 35. Environment Configuration

Use environment variables.

Example:

```text
NODE_ENV
PORT

MONGODB_URI

REDIS_URL

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN

CORS_ORIGIN

FILE_STORAGE_PROVIDER
FILE_STORAGE_PATH

RATE_LIMIT_MESSAGES
```

Validate environment configuration at application startup.

Fail fast if mandatory variables are missing.

---

# 36. Frontend State Architecture

Use Zustand for:

- authentication state;
- current user;
- current room;
- realtime connection state;
- transient UI state.

Use TanStack Query for:

- REST API data;
- rooms;
- message history;
- notifications;
- user profiles.

Do not duplicate server state unnecessarily in Zustand.

---

# 37. WebSocket Client Architecture

Create a dedicated abstraction:

```typescript
SocketService
```

Responsibilities:

- connect;
- disconnect;
- authenticate;
- reconnect;
- subscribe to events;
- emit events;
- expose connection state.

Implement automatic reconnection.

Handle:

```text
connected
disconnected
reconnecting
reconnected
authentication_failed
```

---

# 38. Offline/Reconnection Behavior

When connection is temporarily lost:

UI should show:

```text
Reconnecting...
```

When restored:

```text
Connected
```

The client must refresh potentially stale state after reconnection.

At minimum:

- active room;
- recent messages;
- presence;
- unread counters.

Messages must not silently disappear because of a temporary connection failure.

---

# 39. Optimistic UI

Use optimistic updates only where safe.

Suitable examples:

- reactions;
- typing indicators;
- read state.

Message sending should use a temporary client ID:

```text
clientMessageId
```

This allows the frontend to reconcile:

```text
optimistic message
        ↓
server message
```

and prevents duplicates.

---

# 40. Message Delivery

Each outgoing message should include:

```typescript
clientMessageId: string
```

The backend must treat repeated `(userId, clientMessageId)` combinations as idempotent.

This prevents duplicate messages during retries.

---

# 41. UI Pages

Required pages:

```text
/login
/register
/app
/settings
/profile/:username
```

The main application contains:

```text
Sidebar
RoomList
ChatWindow
MemberList
NotificationCenter
```

---

# 42. Main Chat Interface

Desktop layout:

```text
┌──────────────┬───────────────────────────┬─────────────┐
│              │                           │             │
│    ROOMS     │          CHAT             │   MEMBERS   │
│              │                           │             │
│ # general    │  Messages                │ 🟢 Alex     │
│ # developers │                           │ 🟢 Maria    │
│ # random     │                           │ 🟢 Dmytro   │
│              │                           │             │
│ + New room   │                           │ ⚪ John     │
│              │                           │             │
│              │  Message input            │             │
└──────────────┴───────────────────────────┴─────────────┘
```

The UI must be responsive.

Mobile layout should collapse sidebars into drawers/navigation panels.

---

# 43. UI States

Every data-driven component must account for:

- loading;
- empty;
- success;
- error;
- offline;
- unauthorized;
- forbidden.

Never leave blank UI states without explanation.

---

# 44. Accessibility

The application must support:

- keyboard navigation;
- visible focus states;
- semantic HTML;
- accessible buttons;
- labels for form fields;
- appropriate ARIA attributes;
- sufficient contrast;
- screen-reader-friendly notifications.

Do not sacrifice accessibility for visual simplicity.

---

# 45. Theme

Support:

```text
Light
Dark
System
```

Persist user preference.

Use a clean, modern interface.

Avoid excessive visual effects.

The design should look like a professional SaaS product rather than a student project.

---

# 46. Backend Module Structure

NestJS modules:

```text
AuthModule
UsersModule
RoomsModule
MessagesModule
ReactionsModule
NotificationsModule
PresenceModule
RealtimeModule
UploadsModule
HealthModule
```

Infrastructure:

```text
DatabaseModule
RedisModule
StorageModule
LoggingModule
```

Keep modules independent.

Avoid circular dependencies.

---

# 47. Service Layer

Controllers and WebSocket gateways must remain thin.

Bad:

```typescript
@WebSocketGateway()
handleMessage() {
    // 200 lines of business logic
}
```

Good:

```typescript
handleMessage(dto) {
    return this.messageService.createMessage(...)
}
```

Business logic belongs in services/use cases.

---

# 48. Database Indexes

At minimum:

### Users

```text
email
username
```

### Room Members

```text
(roomId, userId)
(userId, roomId)
```

### Messages

```text
(roomId, createdAt)
(authorId, createdAt)
(roomId, clientMessageId, authorId)
```

### Notifications

```text
(userId, createdAt)
(userId, readAt)
```

Indexes must be documented.

---

# 49. Logging

Use structured logging.

Every important backend event should contain context such as:

```text
requestId
userId
roomId
messageId
event
duration
```

Never log:

- passwords;
- JWTs;
- refresh tokens;
- sensitive personal information.

---

# 50. Request Correlation

Generate or propagate a request ID.

Example:

```text
X-Request-ID
```

Include it in logs.

This should work for REST requests.

WebSocket events should also have correlation identifiers where practical.

---

# 51. Health Checks

Implement:

```text
GET /health
GET /health/readiness
GET /health/liveness
```

Readiness must verify critical dependencies:

```text
MongoDB
Redis
```

Liveness should primarily indicate that the process is running.

---

# 52. Graceful Shutdown

On SIGTERM/SIGINT:

1. stop accepting new connections;
2. finish active operations where possible;
3. disconnect WebSocket clients gracefully;
4. close MongoDB;
5. close Redis;
6. terminate process.

This is important for Docker and rolling deployments.

---

# 53. Testing Strategy

Testing is mandatory.

## Unit tests

Test:

- authentication;
- authorization;
- message validation;
- room permissions;
- presence logic;
- notification logic;
- pagination;
- idempotency.

## Integration tests

Test:

```text
register
→ login
→ create room
→ join room
→ send message
→ retrieve history
```

## WebSocket tests

Test:

```text
Client A connects
Client B connects

A joins room
B joins room

A sends message

B receives message:new
```

Also test:

- unauthorized socket;
- unauthorized room;
- reconnect;
- duplicate clientMessageId;
- typing events;
- reactions;
- presence.

## Frontend tests

Test:

- login;
- room selection;
- message rendering;
- sending messages;
- reconnect state;
- unread counts.

---

# 54. End-to-End Tests

Use Playwright.

Critical flow:

```text
Register user A
Register user B

User A creates room

User B joins room

A sends message

B receives message

B replies

A reacts

A edits message

B sees edit
```

---

# 55. Test Data

Provide deterministic test fixtures.

Create a development seed script:

```text
npm run db:seed
```

Seed:

- demo users;
- demo rooms;
- sample messages;
- reactions.

Never use production secrets in seed data.

---

# 56. Docker

Development must work with:

```bash
docker compose up
```

Services:

```text
web
api
mongodb
redis
nginx
```

Production compose should support:

```text
api-1
api-2
mongodb
redis
nginx
```

This configuration must demonstrate that multiple WebSocket instances can communicate through Redis.

---

# 57. Reverse Proxy

Nginx must route:

```text
/api/*
```

to the backend.

WebSocket traffic:

```text
/socket.io/*
```

must support HTTP upgrade.

Frontend assets should be served through Nginx in production.

---

# 58. CI/CD

GitHub Actions pipeline:

```text
install
    ↓
lint
    ↓
typecheck
    ↓
unit tests
    ↓
integration tests
    ↓
build
    ↓
Docker build
```

Pull requests must fail if:

- lint fails;
- type checking fails;
- tests fail;
- build fails.

---

# 59. Code Quality

Mandatory:

- ESLint;
- Prettier;
- strict TypeScript;
- consistent naming;
- no dead code;
- no unused dependencies;
- no unnecessary abstractions.

Use:

```text
camelCase
PascalCase
UPPER_SNAKE_CASE
```

consistently according to context.

---

# 60. Documentation

Required documentation:

```text
README.md
docs/architecture.md
docs/api.md
docs/websocket-events.md
docs/security.md
docs/deployment.md
docs/decisions/
```

Architecture decisions should explain important tradeoffs.

Example:

```text
ADR-001: Why MongoDB
ADR-002: Why Redis Pub/Sub
ADR-003: Why Socket.IO
ADR-004: Why cursor pagination
ADR-005: Why Zustand + TanStack Query
```

---

# 61. API Documentation

Swagger/OpenAPI must be available in development.

Example:

```text
/api/docs
```

Document:

- endpoints;
- authentication;
- request DTOs;
- response DTOs;
- errors;
- pagination;
- authorization requirements.

---

# 62. Observability

The application should expose basic metrics.

Track:

```text
active WebSocket connections
messages per minute
message processing latency
HTTP request latency
errors
Redis connectivity
MongoDB connectivity
```

A full Prometheus/Grafana stack is optional unless it can be implemented without significantly increasing project complexity.

---

# 63. Performance Requirements

The system should be designed to support at least:

```text
1000 concurrent WebSocket connections
100 messages/second
```

These are engineering targets, not guaranteed production SLAs.

Avoid:

- N+1 database queries;
- loading entire message histories;
- broadcasting events unnecessarily;
- unbounded Redis keys;
- unbounded WebSocket payloads.

---

# 64. Security Threat Model

Explicitly consider:

### Authentication attacks

- brute force;
- token theft;
- refresh token replay.

### Authorization attacks

- accessing private rooms;
- modifying another user's messages;
- deleting another user's messages;
- subscribing to unauthorized rooms.

### Application attacks

- XSS;
- injection;
- oversized payloads;
- malicious uploads;
- spam;
- WebSocket flooding.

Document mitigations.

---

# 65. AI-First Development Rules

This section is specifically intended for Cursor.

## Rule 1 — Specification First

Do not implement features that are not defined in this specification without first documenting the change.

## Rule 2 — Inspect Before Modifying

Before modifying code:

1. inspect relevant files;
2. understand existing interfaces;
3. identify dependencies;
4. identify tests;
5. make the smallest coherent change.

## Rule 3 — Do Not Rewrite Working Systems

Never rewrite an existing module merely to make it stylistically different.

Preserve working behavior unless the specification explicitly requires change.

## Rule 4 — No Silent Architecture Changes

Do not:

- replace libraries;
- introduce new frameworks;
- change database technology;
- change authentication strategy;
- alter public API contracts;

without explicit approval.

## Rule 5 — Test Every Feature

Every non-trivial backend feature must include tests.

## Rule 6 — Keep Changes Small

Prefer incremental implementation.

A single task should ideally modify a coherent feature rather than the entire application.

## Rule 7 — Preserve Type Safety

Do not use:

```typescript
any
```

to bypass compiler errors.

Fix the underlying type problem.

## Rule 8 — Explain Non-Obvious Decisions

Complex logic should contain concise comments explaining **why**, not what the code does.

---

# 66. Cursor Development Workflow

The AI agent should follow this workflow for every task.

```text
1. Read SPECIFICATION.md
2. Inspect repository
3. Identify relevant modules
4. Create implementation plan
5. Implement
6. Run type checking
7. Run lint
8. Run relevant tests
9. Fix failures
10. Review changes
11. Update documentation if necessary
```

Never skip validation.

---

# 67. Cursor Task Format

Each implementation request should have the following structure:

```text
TASK

Goal:
<single concrete goal>

Context:
<relevant architectural context>

Requirements:
- ...
- ...
- ...

Constraints:
- ...
- ...

Acceptance Criteria:
- ...
- ...

Tests:
- ...
- ...

Do not:
- ...
- ...
```

Cursor should not implement unrelated improvements while completing the task.

---

# 68. Recommended Implementation Order

The project should be implemented in phases.

## Phase 1 — Repository Foundation

Implement:

- monorepo;
- package manager;
- TypeScript;
- ESLint;
- Prettier;
- shared package;
- Docker;
- environment validation;
- basic CI.

---

## Phase 2 — Backend Foundation

Implement:

- NestJS;
- MongoDB;
- Redis;
- configuration;
- logging;
- health checks;
- Swagger;
- error handling.

---

## Phase 3 — Authentication

Implement:

- registration;
- login;
- JWT;
- refresh tokens;
- logout;
- authorization guards;
- tests.

---

## Phase 4 — Users and Rooms

Implement:

- profiles;
- public rooms;
- private rooms;
- direct rooms;
- memberships;
- permissions.

---

## Phase 5 — Messaging

Implement:

- message persistence;
- pagination;
- editing;
- deletion;
- idempotency;
- replies;
- reactions.

---

## Phase 6 — Realtime

Implement:

- WebSocket authentication;
- room subscriptions;
- message events;
- typing;
- presence;
- Redis Pub/Sub;
- multi-instance support.

---

## Phase 7 — Notifications

Implement:

- mentions;
- replies;
- direct messages;
- invitations;
- notification center.

---

## Phase 8 — Attachments and Search

Implement:

- storage abstraction;
- uploads;
- image previews;
- file validation;
- message search.

---

## Phase 9 — Frontend

Implement:

- authentication UI;
- application shell;
- room list;
- chat;
- members;
- notifications;
- profiles;
- settings.

---

## Phase 10 — Resilience

Implement:

- reconnection;
- optimistic updates;
- offline state;
- idempotent messaging;
- error recovery.

---

## Phase 11 — Testing

Implement:

- unit tests;
- integration tests;
- WebSocket tests;
- frontend tests;
- Playwright E2E.

---

## Phase 12 — Production Infrastructure

Implement:

- production Docker Compose;
- Nginx;
- multiple API instances;
- Redis;
- health checks;
- graceful shutdown;
- CI/CD.

---

## Phase 13 — Final Polish

Implement:

- accessibility;
- responsive design;
- dark mode;
- performance improvements;
- documentation;
- architecture diagrams;
- ADRs.

---

# 69. Definition of Done

The project is considered complete only when all of the following are true.

## Functional

- [ ] Users can register.
- [ ] Users can authenticate.
- [ ] Users can log out.
- [ ] Users can create rooms.
- [ ] Users can join/leave rooms.
- [ ] Private room authorization works.
- [ ] Users can send messages.
- [ ] Messages persist in MongoDB.
- [ ] Messages appear in real time.
- [ ] Message history supports cursor pagination.
- [ ] Messages can be edited.
- [ ] Messages can be soft-deleted.
- [ ] Users can react to messages.
- [ ] Users can reply to messages.
- [ ] Mentions work.
- [ ] Typing indicators work.
- [ ] Online presence works.
- [ ] Unread counts work.
- [ ] Notifications work.
- [ ] Search works.
- [ ] Attachments work.
- [ ] Direct messages work.

## Technical

- [ ] TypeScript strict mode enabled.
- [ ] No unjustified `any`.
- [ ] Backend is modular.
- [ ] REST API documented.
- [ ] WebSocket events documented.
- [ ] MongoDB indexes implemented.
- [ ] Redis presence implemented.
- [ ] Redis Pub/Sub implemented.
- [ ] Multiple backend instances work.
- [ ] Rate limiting works.
- [ ] Authentication is secure.
- [ ] Authorization is enforced server-side.
- [ ] Input validation exists.
- [ ] Structured logging exists.
- [ ] Health checks exist.
- [ ] Graceful shutdown exists.

## Quality

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] WebSocket tests pass.
- [ ] E2E tests pass.
- [ ] Lint passes.
- [ ] Type checking passes.
- [ ] Production build succeeds.
- [ ] Docker build succeeds.
- [ ] CI pipeline passes.

## Documentation

- [ ] README completed.
- [ ] Architecture documented.
- [ ] API documented.
- [ ] WebSocket events documented.
- [ ] Security model documented.
- [ ] Deployment documented.
- [ ] Architecture decisions documented.
- [ ] Architecture diagram included.

---

# 70. Final Portfolio Requirements

The repository must be understandable to an external reviewer within approximately five minutes.

The README should immediately communicate:

1. What the application does.
2. Why it is technically interesting.
3. Architecture.
4. Technology stack.
5. How to run it.
6. Screenshots/GIFs.
7. Testing strategy.
8. Scaling approach.
9. Key engineering decisions.

Include screenshots or a short demo GIF showing:

- login;
- room selection;
- realtime messaging;
- online presence;
- typing indicator;
- reactions;
- notifications;
- responsive interface.

The repository must not look like an AI-generated code dump.

The final codebase must have:

- coherent architecture;
- consistent naming;
- meaningful commits;
- useful documentation;
- tests;
- deliberate technical decisions.

---

# 71. Primary Engineering Objective

The primary objective of Pulse Chat is not to maximize the number of features.

The objective is to demonstrate the ability to design and implement a complete real-time distributed application with:

```text
TypeScript
    ↓
React
    ↓
NestJS
    ↓
WebSockets
    ↓
Redis
    ↓
MongoDB
    ↓
Docker
    ↓
CI/CD
```

The final result should be small enough to understand, but sophisticated enough to demonstrate real software engineering competence.