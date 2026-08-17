# Working in this repository

`SPECIFICATION.md` is the source of truth for product scope, architecture and
process. It wins over this file and over any existing code. This file only
describes how the workspace is wired, so a change can be made safely without
reading every package.

## Workspace map

| Package                     | Location                 | Role                                                     |
| --------------------------- | ------------------------ | -------------------------------------------------------- |
| `@pulse-chat/api`           | `apps/api`               | NestJS backend: REST, WebSocket, persistence             |
| `@pulse-chat/web`           | `apps/web`               | React frontend bundled by Vite                           |
| `@pulse-chat/shared`        | `packages/shared`        | Contracts shared by both apps: types, schemas, constants |
| `@pulse-chat/config`        | `packages/config`        | TypeScript compiler configurations                       |
| `@pulse-chat/eslint-config` | `packages/eslint-config` | ESLint flat configurations                               |

Allowed dependency directions:

```text
apps/api  ─┐
           ├─► packages/shared ─► (nothing in this workspace)
apps/web  ─┘
```

The two apps never import each other. Nothing imports an app.

## Invariants

1. **Import by package name, never by path.** `@pulse-chat/shared`, not
   `../../packages/shared/src/...`. ESLint enforces this.
2. **`packages/shared` stays platform-neutral.** It runs in the browser and in
   Node, so it has no DOM and no Node types and must not gain runtime
   dependencies on either. Its tsconfig sets `"types": []` and its lint preset
   bans `process`, `Buffer`, `window` and friends. For the same reason its
   tsconfig covers `src` only: build tooling drags `@types/node` into whatever
   program contains it. Frontend sources are guarded the same way, because Node
   globals type check there but do not exist at runtime.
3. **One public entry point per package.** Add exports to
   `packages/shared/src/index.ts`; do not deep-import internals.
4. **Configuration is shared, not copied.** Change compiler options in
   `packages/config/tsconfig/*.json` and lint rules in
   `packages/eslint-config/*.js`. A per-package override needs a comment saying
   why.
5. **Strict TypeScript, no `any`.** Fix the type, do not widen it. See
   `SPECIFICATION.md` section 2.2 and rule 7.
6. **Tests live next to the code** as `*.spec.ts` / `*.spec.tsx`, and every
   non-trivial backend behaviour ships with them.
7. **Add a dependency in the phase that uses it.** The absence of Socket.IO,
   Mongoose, Redis, Zustand and friends is intentional, not an oversight.
8. **Warnings fail the build.** Lint runs with `--max-warnings 0`.

## Validating a change

```bash
pnpm verify                        # lint + typecheck + test + build, in dependency order
pnpm --filter @pulse-chat/api test # one package
pnpm format
```

`pnpm verify` is what CI runs. Do not report a task complete before it passes.

## Runtime requirements

Node `^22.13.0 || >=24.0.0`. `packages/shared` is ESM-only and the backend
compiles to CommonJS, so the backend depends on Node's support for
`require()` of ES modules, which landed in Node 22.12.
