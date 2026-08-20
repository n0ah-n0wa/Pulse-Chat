# Production image for @pulse-chat/api.
#
# Not used by the development stack. It is kept here so that production and
# development never share an image definition: this one carries compiled output
# and production dependencies only, runs as a non-root user, and mounts nothing.

ARG NODE_VERSION=22.15.0

FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Optional roots for networks that intercept TLS; see certs/README.md. The slim
# base image has no system trust store, so it is added here as well.
COPY infrastructure/docker/certs/ /usr/local/share/ca-certificates/pulse-chat/
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN corepack enable pnpm

WORKDIR /app

# Manifests are their own stage so both the build and the runtime dependency
# install reuse the same cached layer.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/shared/package.json ./packages/shared/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @pulse-chat/api...
COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @pulse-chat/shared build \
    && pnpm --filter @pulse-chat/api build

FROM manifests AS runtime-deps
RUN pnpm install --frozen-lockfile --prod --filter @pulse-chat/api...

FROM base AS production

ENV NODE_ENV=production \
    PORT=3000

# Production dependency tree plus the manifests that resolve the workspace link
# from apps/api to packages/shared.
COPY --from=runtime-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/liveness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]
