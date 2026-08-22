# Production image for @pulse-chat/web: static assets served by nginx.
#
# Not used by the development stack, which runs the Vite dev server instead.
# The frontend is compiled here and the result contains no Node runtime.

ARG NODE_VERSION=22.15.0
ARG NGINX_VERSION=1.30

FROM node:${NODE_VERSION}-bookworm-slim AS build

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY e2e/package.json ./e2e/
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter @pulse-chat/web...

COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN pnpm --filter @pulse-chat/shared build \
    && pnpm --filter @pulse-chat/web build

FROM nginx:${NGINX_VERSION}-alpine AS production

COPY infrastructure/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY infrastructure/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/nginx-health || exit 1
