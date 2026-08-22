# ADR-005: Zustand + TanStack Query on the web client

- Status: Accepted
- Date: 2026-08-22

## Context

The SPA has two kinds of state: REST resources (rooms, history,
profiles, notifications) that should be cached, invalidated, and
refetched; and session/ephemeral state (tokens, socket connection,
presence maps, typing, unread overlays) that is not a GET resource.

Putting both in one store duplicates server truth and fights cache
lifetimes. Putting tokens only in React Query makes logout and persist
awkward.

## Decision

- **Zustand** owns auth (persisted as `pulse-chat-auth` in
  `localStorage`), socket connection flags, presence, typing, and room
  UI overlays.
- **TanStack Query** owns REST reads. `useRealtimeSync` patches those
  caches from Socket.IO events.
- Logout / failed refresh calls `resetClientState` (clear Zustand, Query
  cache, socket) and bumps `sessionGeneration` so an in-flight refresh
  cannot restore the previous user.

`AppShell` (not only `/app`) runs realtime subscription hooks so
settings and public-layout pages still receive events when signed in.

## Alternatives considered

- **Redux Toolkit.** More ceremony for the same split; no existing
  Redux code in the repo.
- **TanStack Query only.** Access tokens and typing indicators are not
  query-shaped; presence would become ad-hoc module state anyway.
- **Zustand only.** Would reimplement caching, deduping, and
  background refetch that Query already provides for rooms and
  messages.

## Consequences

- Two mental models for contributors; the table in
  [`architecture.md`](../architecture.md) is the map.
- Tokens in `localStorage` are an XSS residual (see
  [`security.md`](../security.md)).
