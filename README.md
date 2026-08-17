# Pulse Chat

Real-time chat platform built with TypeScript end to end: React on the front end,
NestJS on the back end, MongoDB for persistence, Redis for ephemeral state and
cross-instance events.

> **Status: Phase 1 — repository foundation.**
> The monorepo, toolchain and quality gates are in place. No application
> features are implemented yet. The full product and engineering contract lives
> in [`SPECIFICATION.md`](./SPECIFICATION.md); implementation follows the phases
> defined in section 68 of that document.

## Repository layout

```text
pulse-chat/
├── apps/
│   ├── api/                 NestJS backend (REST + WebSocket)
│   └── web/                 React + Vite frontend
├── packages/
│   ├── config/              Shared TypeScript compiler configurations
│   ├── eslint-config/       Shared ESLint flat configurations
│   └── shared/              Types, schemas and constants shared by both apps
├── infrastructure/
│   ├── docker/              Container build context (Phase 12)
│   └── nginx/               Reverse proxy configuration (Phase 12)
├── docs/                    Architecture, API, security and decision records
└── .github/workflows/       CI pipeline
```

## Prerequisites

| Tool    | Version                                 |
| ------- | --------------------------------------- |
| Node.js | `^22.13.0 \|\| >=24.0.0` (see `.nvmrc`) |
| pnpm    | `>=11`                                  |

## Getting started

```bash
pnpm install
pnpm verify      # lint + typecheck + test + build
```

## Workspace commands

All commands run from the repository root and are orchestrated by Turborepo.

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Run every app in watch mode                     |
| `pnpm build`        | Build all packages and apps                     |
| `pnpm typecheck`    | Type-check every package with strict TypeScript |
| `pnpm lint`         | Lint every package with ESLint                  |
| `pnpm test`         | Run the Vitest suites                           |
| `pnpm verify`       | Everything above, in dependency order           |
| `pnpm clean`        | Remove build output from every package          |
| `pnpm format`       | Format the repository with Prettier             |
| `pnpm format:check` | Verify formatting without writing               |

To target a single workspace package, use pnpm filters:

```bash
pnpm --filter @pulse-chat/api test
pnpm --filter @pulse-chat/web dev
```

## Technology stack

- **Frontend:** React 19, Vite, Tailwind CSS, Vitest, React Testing Library
- **Backend:** NestJS 11, Vitest
- **Language:** TypeScript 6, strict mode everywhere
- **Tooling:** pnpm workspaces, Turborepo, ESLint 10 (flat config), Prettier

Libraries that belong to features not yet implemented (React Router, Zustand,
TanStack Query, Socket.IO, Mongoose, Redis, Zod, Passport) are added in the
phase that introduces them, so the dependency tree stays honest about what the
code actually uses.

## Documentation

- [`SPECIFICATION.md`](./SPECIFICATION.md) — product and engineering specification
- [`AGENTS.md`](./AGENTS.md) — workspace map, dependency rules and invariants
- [`docs/architecture.md`](./docs/architecture.md) — system architecture
- [`docs/api.md`](./docs/api.md) — REST API reference
- [`docs/websocket-events.md`](./docs/websocket-events.md) — realtime event contracts
- [`docs/security.md`](./docs/security.md) — security model and threat mitigations
- [`docs/deployment.md`](./docs/deployment.md) — deployment and operations
- [`docs/decisions/`](./docs/decisions) — architecture decision records
