# ADR-004: Cursor pagination for messages and notifications

- Status: Accepted
- Date: 2026-08-22

## Context

Chat history and notifications grow while the user is paging. Offset
pagination (`skip` / `page`) duplicates or skips rows when new documents
land at the head of the collection. Loading an entire room is unbounded.

## Decision

List endpoints return `{ items, nextCursor? }` newest-first. Clients
pass `nextCursor` as `before` (the ObjectId of the oldest item already
shown). The store query is a compound range on `(createdAt, _id)`
(messages) or equivalent id order (notifications).

Defaults and caps live in `@pulse-chat/shared`: messages default 50,
max 100; notifications default 20, max 50.

Invalid `before` ids that are not in the room yield
`INVALID_MESSAGE_CURSOR` (messages).

## Alternatives considered

- **Offset pages.** Unstable under inserts; `skip` is expensive as
  offsets grow.
- **Keyset on `createdAt` alone.** Two messages can share a timestamp;
  `_id` breaks ties.
- **Infinite `limit`.** Rejected; the API always caps page size.

## Consequences

- The UI prepends older pages; it does not jump to an arbitrary offset.
- Search uses the same `limit` / `before` shape on the text-index query.
- Clients must treat `nextCursor` as opaque except that it is a resource
  id they already received.
