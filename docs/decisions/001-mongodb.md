# ADR-001: MongoDB for durable chat data

- Status: Accepted
- Date: 2026-08-22

## Context

Pulse Chat persists users, rooms, memberships, messages, reactions,
attachments metadata, notifications, and refresh-token families. History
is paged newest-first under live inserts. Direct rooms need a sparse
unique key on an unordered user pair. Message search is per-room full
text.

## Decision

Use MongoDB 8 (Mongoose) as the only durable store. Collections:

`users`, `rooms`, `room_members`, `messages`, `message_reactions`,
`attachments`, `notifications`, `refresh_tokens`.

Compound indexes match access patterns, for example messages
`(roomId, createdAt, _id)` for cursors and `(roomId, content)` as a text
index for search. `directKey` on rooms is unique and sparse.

Repositories sit behind interfaces so domain services do not import
Mongoose models.

## Alternatives considered

- **PostgreSQL.** A normalized schema can model this, but cursor pages
  over live inserts, optional room fields, and a sparse unique DM key
  fight a rigid table layout. The team already needed document-shaped
  message payloads (attachments array, optional reply).
- **MongoDB replica set / transactions.** Compose runs a standalone
  `mongod`. Multi-document transactions and change streams are therefore
  unavailable. Attachment linking and message insert are sequential, not
  transactional. A replica set can be added later if a feature requires
  it; it is not implemented.

## Consequences

- Horizontal data scaling (sharding) is out of scope for this compose
  file.
- Orphaned messages can remain after a room document is deleted; room
  delete does not bulk-delete history.
- Search is MongoDB `$text`, not Elasticsearch. Query operators are
  quoted so users cannot inject text-search syntax.
