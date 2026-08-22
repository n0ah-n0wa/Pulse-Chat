# ADR-003: Socket.IO with websocket-only transport

- Status: Accepted
- Date: 2026-08-22

## Context

The product needs authenticated realtime: room fan-out, presence,
typing, and personal notifications. A raw WebSocket would require a
framing protocol, reconnection policy, and handshake auth of our own.

Engine.IO's HTTP long-polling fallback complicates nginx (sticky
sessions for the handshake) without helping a modern browser behind a
single origin that already upgrades WebSockets.

## Decision

Use Socket.IO (`@nestjs/platform-socket.io` and `socket.io-client`) with:

- path `/socket.io`
- `transports: ['websocket']` only
- handshake `auth.token` (Bearer header also accepted)
- named events from `@pulse-chat/shared`

REST remains the path for edits, deletes, reactions, and mark-read.
`message:send` shares `MessagesService.createMessage` with HTTP POST.

Production nginx uses `least_conn` and does not require sticky sessions
for Engine.IO, because there is no polling transport to pin.

## Alternatives considered

- **Raw `ws`.** Less surface area, more protocol to invent and test.
- **SSE.** One-way; typing and join still need a writable channel.
- **Allow polling.** Would push us toward sticky load balancing for no
  current client that needs it.

## Consequences

- Clients that cannot open a WebSocket cannot use realtime (acceptable
  for this browser SPA).
- Token rotation must reconnect the socket. The SPA keeps room
  refcounts across that reconnect so subscriptions are restored.
- Cross-instance delivery is still Redis Pub/Sub (ADR-002), not
  Socket.IO clustering.
