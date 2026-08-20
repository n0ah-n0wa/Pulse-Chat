# Development image for the whole workspace.
#
# One image backs every Node service in docker-compose.yml: in development the
# source tree is bind-mounted and the containers differ only in the command they
# run, so building three near-identical images would only cost time.
#
# Production images are a separate concern and live in api.Dockerfile and
# web.Dockerfile, which install production dependencies only and carry no source.

ARG NODE_VERSION=22.15.0

FROM node:${NODE_VERSION}-bookworm-slim AS development

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NODE_ENV=development

# Optional roots for networks that intercept TLS; see certs/README.md. The
# directory holds only documentation unless a developer adds their own. The slim
# base image has no system trust store, so it is added here as well.
COPY infrastructure/docker/certs/ /usr/local/share/ca-certificates/pulse-chat/
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# The pnpm version comes from "packageManager" in the root package.json.
RUN corepack enable pnpm

WORKDIR /app

# Manifests first: the dependency layer is reused until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# No source is copied: docker-compose.yml mounts the repository over /app and
# the workspace service reinstalls if the lockfile has moved on.
