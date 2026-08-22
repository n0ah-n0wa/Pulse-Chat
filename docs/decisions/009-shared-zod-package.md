# ADR-009: Shared Zod package as the contract

- Status: Accepted
- Date: 2026-08-22

## Context

REST bodies, Socket.IO payloads, and the SPA form/UX limits must agree
(message length, page size, username rules, attachment caps). Duplicating
those numbers in Nest DTOs and React forms drifts.

`packages/shared` must run in the browser and in Node: no DOM, no Node
types, no `process` / `window`.

## Decision

Keep one public entry (`@pulse-chat/shared`) with Zod schemas, TypeScript
types, error codes, and constants. Apps import the package name only
(ESLint enforces this). The API is the authority: it re-parses with the
same schemas (`ZodValidationPipe` / Socket.IO parse). The client uses the
same numbers for immediate feedback.

Socket `message:send` is `createMessageSchema` plus `roomId`, so REST and
WebSocket cannot accept different message shapes.

## Alternatives considered

- **OpenAPI-first codegen.** Swagger is mounted in non-production only
  and is generated from Nest metadata; it is not the source of truth.
- **Separate DTOs per app.** Faster to start, guaranteed drift.
- **Runtime dependency on Node in shared.** Would break the Vite bundle
  or force a second package.

## Consequences

- Changing a limit is one edit in `packages/shared` plus tests in both
  apps.
- Shared stays free of Nest and React imports.
- Deep imports of package internals are banned; export through
  `src/index.ts`.
