# Deployment

## Development stack

`docker compose up` starts the whole environment from a clean checkout with no
configuration. It is defined in `docker-compose.yml` at the repository root.

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

### Design decisions

**Service names, not localhost.** Containers reach each other over the compose
network by service name. `MONGODB_URI` is `mongodb://mongodb:27017/pulse_chat`
and `REDIS_URL` is `redis://redis:6379`. Inside a container `localhost` is that
container alone, so these names are the only addresses that work.

**One entry point.** Nginx serves the frontend and proxies `/api` and
`/socket.io` to the backend, so the browser sees one origin in development just
as it will in production. Cookies and CORS therefore behave the same in both
environments. The `/api` prefix is passed through unchanged, leaving the prefix
owned by the backend. Upgrade headers are set for every location, because both
Socket.IO and the Vite hot-reload channel are WebSockets.

**Nginx resolves upstreams per request** using Docker's embedded DNS at
127.0.0.11. Without this, nginx caches an address at startup and keeps sending
traffic to a container that has since restarted with a new address.

**A `workspace` service owns installation and the shared build.** `api` and
`web` both consume `@pulse-chat/shared`, and if each rebuilt it they would race
on the same output directory. This service installs dependencies, compiles the
package, then keeps watching it. Its health check gates the other two, which
means they only start once dependencies and compiled contracts exist.

**Named volumes hold `node_modules`.** The repository is bind-mounted so edits
need no rebuild, but that mount would otherwise shadow the Linux dependency
trees with the host's, which contain native bindings built for the host
platform. The volumes keep the container's own trees. As a consequence, a
changed lockfile is picked up by the reinstall the `workspace` service runs at
startup, not by the volume, which is only populated once.

**No credentials anywhere.** MongoDB and Redis run without authentication and
are published only on the loopback interface. There is nothing to hardcode and
nothing to leak. Production must reverse both of those decisions.

**Redis is configured as ephemeral state, not a cache.** Persistence is off
(`--save "" --appendonly no`): presence, typing indicators and rate-limit
counters must not survive a restart. The eviction policy is `noeviction` so that
memory pressure fails loudly rather than silently discarding presence keys,
which would make users appear offline for no visible reason.

**MongoDB has a persistent volume** (`mongodb-data`) and a capped WiredTiger
cache. The Docker VM has only a few gigabytes, and the default cache sizing
would claim most of it and starve the application containers.

### Health checks

Every service reports health, and dependent services wait for it:

| Service     | Check                                                  |
| ----------- | ------------------------------------------------------ |
| `mongodb`   | `mongosh --eval "db.adminCommand('ping').ok"`          |
| `redis`     | `redis-cli ping`                                       |
| `workspace` | marker file written after install and the shared build |
| `api`       | any HTTP response on port 3000                         |
| `web`       | any HTTP response on port 5173                         |
| `nginx`     | `GET /nginx-health`, which needs no upstream           |

The `api` and `web` checks accept any HTTP status, because a 404 still proves
the server accepts connections. They should move to `/health/readiness` once the
health module exists, so that a running process with a broken database
connection is reported as unhealthy.

### Known limitations

- **Backend hot reload does not work on Windows or macOS hosts.** `node --watch`
  relies on filesystem events, and those do not cross a Docker Desktop bind
  mount. The frontend and the shared package poll instead, which their watchers
  support. On Windows, running the API on the host against containerised data
  stores gives a faster loop: `docker compose up -d mongodb redis && pnpm dev`.
- **Bind-mounted files are written by root** in the container. Harmless on
  Docker Desktop; on a native Linux host, expect root-owned build output.
- MongoDB runs standalone, so multi-document transactions and change streams are
  unavailable. Both need a replica set, which can be added if a feature requires
  it.
- Networks that intercept TLS break `pnpm install` during image builds. See
  `infrastructure/docker/certs/README.md`.

## Already fixed constraints

- **Node runtime: `^22.13.0 || >=24.0.0`.** `@pulse-chat/shared` is ESM-only
  while the backend compiles to CommonJS, so the backend relies on Node's
  support for `require()` of ES modules (Node 22.12+). Backend container images
  must not use an older Node base image.

## Production

Not built yet. The image definitions exist and are verified to build, but the
production topology belongs to the production infrastructure phase.

- `infrastructure/docker/api.Dockerfile` target `production` — compiled output
  and production dependencies only, runs as the non-root `node` user.
- `infrastructure/docker/web.Dockerfile` target `production` — static assets
  served by nginx using `infrastructure/nginx/spa.conf`. API routing is
  deliberately absent: the front-facing proxy owns it.

What a production stack must change relative to development:

- enable authentication on MongoDB and Redis, with secrets injected at deploy
  time and never committed;
- run two API instances behind nginx to prove Redis Pub/Sub carries realtime
  events between them;
- terminate TLS, and serve the built frontend instead of a dev server;
- mount no source and install no development dependencies;
- add graceful shutdown handling and readiness-gated rolling restarts.
