# Deployment

## Development stack

`docker compose up` starts the whole environment from a clean checkout with
no configuration. It is defined in `docker-compose.yml` at the repository
root.

```text
              browser
                 │  http://localhost:8080
                 ▼
        ┌──────────────────┐
        │      nginx       │   single origin, HTTP upgrade
        └───┬──────────┬───┘
     /api/  │          │  /
 /socket.io/│          │
            ▼          ▼
      ┌─────────┐  ┌─────────┐      ┌───────────┐
      │   api   │  │   web   │◄─────│ workspace │ compiles @pulse-chat/shared
      └────┬────┘  └─────────┘      └───────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌─────────┐
│ mongodb │  │  redis  │
└─────────┘  └─────────┘
```

Development nginx (`infrastructure/nginx/dev.conf`) proxies `/api/` and
`/socket.io/` only. It does **not** proxy `/health*`. Compose still
health-checks the API container on `GET /health/readiness` from inside
the Docker network.

### Design decisions

**Service names, not localhost.** Containers reach each other over the
compose network by service name. `MONGODB_URI` is
`mongodb://mongodb:27017/pulse_chat` and `REDIS_URL` is
`redis://redis:6379`. Inside a container `localhost` is that container
alone, so these names are the only addresses that work.

**One entry point.** Nginx serves the frontend and proxies `/api` and
`/socket.io` to the backend, so the browser sees one origin in
development just as it will in production. Cookies and CORS therefore
behave the same in both environments. The `/api` prefix is passed through
unchanged, leaving the prefix owned by the backend. Upgrade headers are
set for every location, because both Socket.IO and the Vite hot-reload
channel are WebSockets. Vite also proxies `/api` and `/socket.io` to the
API (`http://api:3000` in Compose), so opening the published `:5173` port
does not 404 REST calls — but `http://localhost:8080` remains the
supported origin.

**Nginx resolves upstreams per request** using Docker's embedded DNS at
127.0.0.11. Without this, nginx caches an address at startup and keeps
sending traffic to a container that has since restarted with a new
address.

**A `workspace` service owns installation and the shared build.** `api`
and `web` both consume `@pulse-chat/shared`, and if each rebuilt it they
would race on the same output directory. This service installs
dependencies, compiles the package, then keeps watching it. Its health
check gates the other two, which means they only start once dependencies
and compiled contracts exist.

**Named volumes hold `node_modules`.** The repository is bind-mounted so
edits need no rebuild, but that mount would otherwise shadow the Linux
dependency trees with the host's, which contain native bindings built for
the host platform. The volumes keep the container's own trees. As a
consequence, a changed lockfile is picked up by the reinstall the
`workspace` service runs at startup, not by the volume, which is only
populated once.

**No credentials anywhere.** MongoDB and Redis run without authentication
and are published only on the loopback interface. There is nothing to
hardcode and nothing to leak. Production must reverse both of those
decisions.

**Redis is configured as ephemeral state, not a cache.** Persistence is
off (`--save "" --appendonly no`): presence, typing indicators and
rate-limit counters must not survive a restart. The eviction policy is
`noeviction` so that memory pressure fails loudly rather than silently
discarding presence keys, which would make users appear offline for no
visible reason.

**MongoDB has a persistent volume** (`mongodb-data`) and a capped
WiredTiger cache. The Docker VM has only a few gigabytes, and the default
cache sizing would claim most of it and starve the application containers.

### Health checks

Every service reports health, and dependent services wait for it:

| Service     | Check                                                    |
| ----------- | -------------------------------------------------------- |
| `mongodb`   | `mongosh --eval "db.adminCommand('ping').ok"`            |
| `redis`     | `redis-cli ping`                                         |
| `workspace` | marker file written after install and the shared build   |
| `api`       | `GET /health/readiness` (MongoDB and Redis must respond) |
| `web`       | any HTTP response on port 5173                           |
| `nginx`     | `GET /nginx-health`, which needs no upstream             |

The `web` check accepts any HTTP status, because a 404 still proves the
server accepts connections. The API uses readiness so a running process
with a broken database or Redis connection is reported as unhealthy.
Application logging, correlation, and the three `/health*` routes are
described in `docs/observability.md`.

### Known limitations

- **Backend hot reload does not work on Windows or macOS hosts.**
  `node --watch` relies on filesystem events, and those do not cross a
  Docker Desktop bind mount. Compose therefore **compiles the API once
  and runs `dist`** instead of `@swc-node/register`. Edits to API source
  need a container restart (`docker compose restart api`) to show up.
  The frontend and the shared package poll, which their watchers support.
  On Windows, a faster API loop is still the host process against
  containerised data stores:
  `docker compose up -d mongodb redis && pnpm dev`.
- **Bind-mounted files are written by root** in the container. Harmless
  on Docker Desktop; on a native Linux host, expect root-owned build
  output.
- MongoDB runs standalone, so multi-document transactions and change
  streams are unavailable. Both need a replica set, which is not part of
  this compose file.
- Networks that intercept TLS break `pnpm install` during image builds.
  See `infrastructure/docker/certs/README.md`.

## Already fixed constraints

- **Node runtime: `^22.13.0 || >=24.0.0`.** `@pulse-chat/shared` is
  ESM-only while the backend compiles to CommonJS, so the backend relies
  on Node's support for `require()` of ES modules (Node 22.12+). Backend
  container images must not use an older Node base image.

## Production

`docker compose -f docker-compose.prod.yml up --build` starts the
production topology. Stop the development stack first: both publish nginx
on `127.0.0.1:8080`.

```text
              browser
                 │  http://localhost:8080
                 ▼
        ┌──────────────────┐
        │      nginx       │   single origin, HTTP upgrade
        └───┬──────────┬───┘
     /api/  │          │  /
 /socket.io/│          │
 /health    │          │
            ▼          ▼
      ┌─────┴─────┐  ┌─────────┐
      │  api-1    │  │   web   │  nginx serving compiled assets
      │  api-2    │  └─────────┘
      └─────┬─────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌─────────┐  ┌─────────┐
│ mongodb │  │  redis  │   backend network only, authenticated
└─────────┘  └─────────┘
```

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up --build
```

Optional secrets file (copy `.env.production.example` and replace the
demo values):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up --build
```

Then open <http://localhost:8080>. `X-Pulse-Instance` on API responses
names the Nest process that handled the request. Nginx uses
`least_conn` across `api-1` and `api-2` (not round-robin), so consecutive
HTTP requests may still hit the same instance when connection counts are
uneven. Redis Pub/Sub is what delivers `message:new` (and the other
realtime events) to sockets connected to the other instance.

| Service   | Image / role                                                 | Published      |
| --------- | ------------------------------------------------------------ | -------------- |
| `nginx`   | Front proxy (`infrastructure/nginx/prod.conf`)               | 127.0.0.1:8080 |
| `web`     | Multi-stage SPA image, nginx serving `/usr/share/nginx/html` | —              |
| `api-1`   | Multi-stage API image, non-root `node` user                  | —              |
| `api-2`   | Same image as `api-1`, distinct hostname                     | —              |
| `mongodb` | MongoDB 8 with auth, data in `mongodb-data`                  | —              |
| `redis`   | Redis 8 with `requirepass`, no persistence                   | —              |

Networks: `frontend` holds nginx, web, and both APIs. `backend` holds
the APIs, MongoDB, and Redis. The data stores are not on the frontend
network and are not published to the host.

Shared attachment files use the `api-storage` volume mounted at
`FILE_STORAGE_PATH` on both API containers so an upload handled by
`api-1` can be downloaded from `api-2`. There is no object-storage
adapter.

### Images

- `infrastructure/docker/api.Dockerfile` target `production` — compiled
  output and production dependencies only, runs as the non-root `node`
  user, readiness health check on `/health/readiness` (MongoDB and Redis
  must respond). Compose uses the same probe so a process that cannot
  reach those stores is taken out of rotation.
- `infrastructure/docker/web.Dockerfile` target `production` — static
  assets served by nginx using `infrastructure/nginx/spa.conf`. API
  routing is deliberately absent: the front-facing proxy owns it.

API processes enable Nest shutdown hooks and Compose sends `SIGTERM` with
a 20s grace period.

TLS termination is not part of this compose file: it publishes HTTP on
loopback for a local production-shaped demo. Put a TLS-terminating proxy
in front (or extend `prod.conf`) before exposing the stack beyond
localhost.

OpenAPI (`/api/docs`) is **not** mounted when `NODE_ENV=production`.

To confirm Redis Pub/Sub is carrying events between the two API processes
(after `pnpm install` on the host):

```bash
node infrastructure/docker/verify-prod-stack.mjs
```

Both Socket.IO clients connect through nginx. Nginx `least_conn` should
place them on different API processes. Each sends `message:send` over the
proxy; the peer receives `message:new` on the other instance via Redis
Pub/Sub.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) is the pipeline from
specification section 58, plus Playwright where a hosted Ubuntu runner
can reach MongoDB and Redis as service containers.

Jobs:

1. **Quality** — format, lint, typecheck, unit tests, integration tests,
   application build
2. **End-to-end** — Playwright (needs Quality)
3. **Production images** — `docker compose -f docker-compose.prod.yml
config` plus Buildx builds of the API and web production images
   (`push: false`)
4. **CI** — aggregator that fails unless all three succeed

There is **no deploy job**. Images are not pushed to a registry.

```text
install → format → lint → typecheck → unit tests → integration tests → build
                                                                      ↘
                                                               Docker build
                                                                      ↗
                                                            Playwright e2e
```

Pull requests fail if formatting, lint, typecheck, tests, application
build, or production image build fails. The workflow uses
`pnpm install --frozen-lockfile` and `--max-warnings 0`; a single warning
is a red X.

### Caching

| Cache                               | What it covers                               |
| ----------------------------------- | -------------------------------------------- |
| `setup-node` `cache: pnpm`          | The pnpm store from `pnpm-lock.yaml`         |
| Turborepo `.turbo`                  | Lint / typecheck / test / build task outputs |
| Playwright `~/.cache/ms-playwright` | Chromium browser binaries                    |
| Docker Buildx `type=gha`            | API and web image layers                     |

### GitHub configuration

CI does **not** need repository secrets. Do not add JWT keys, MongoDB
passwords, Redis passwords, or registry credentials for this workflow —
it never deploys.

Required repository settings:

1. **Actions enabled** for the repository (default on github.com).
2. **Fork pull-request workflows** may stay at the default (“require
   approval for first-time contributors”). E2E uses public Mongo/Redis
   images only.
3. **Branch protection** on `main` (Settings → Branches): require the
   aggregated **CI** check. That job succeeds only when Quality,
   End-to-end, and Production images all succeed. Optionally require
   those three jobs individually as well.

`GITHUB_TOKEN` stays at `contents: read` except the Docker job, which
also grants `actions: write` so Buildx can read and write the GitHub
Actions cache. That permission cannot push images or change repository
contents.

### Secrets to add only when you introduce a deploy workflow

This repository has no deploy job. If you add one later, store these in
GitHub Actions secrets (or environments), never in git:

| Secret                     | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `PULSE_JWT_ACCESS_SECRET`  | Access-token signing key (≥ 32 characters)   |
| `PULSE_JWT_REFRESH_SECRET` | Refresh-token signing key (≥ 32 characters)  |
| `PULSE_MONGO_USER`         | MongoDB root user                            |
| `PULSE_MONGO_PASSWORD`     | MongoDB root password                        |
| `PULSE_REDIS_PASSWORD`     | Redis `AUTH` password                        |
| `PULSE_PUBLIC_ORIGIN`      | Public browser origin (`https://…`) for CORS |

Image registry credentials belong in the same place once you push
`pulse-chat-api` / `pulse-chat-web`. Until then,
`docker compose -f docker-compose.prod.yml up --build` on a host with
those values in `.env.production` is the deploy path.

### Running the same gates locally

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml build
```

Playwright needs MongoDB and Redis on localhost:

```bash
docker compose up -d mongodb redis
pnpm --filter @pulse-chat/e2e exec playwright install chromium
pnpm test:e2e
```
