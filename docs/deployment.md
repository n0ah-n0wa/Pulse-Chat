# Deployment

> Placeholder. To be written with the production infrastructure
> (specification sections 56, 57 and 58).

Planned contents: Docker images, development and production Compose stacks,
Nginx reverse proxy configuration, environment variables, health checks,
graceful shutdown and the CI/CD pipeline.

## Already fixed constraints

- **Node runtime: `^22.13.0 || >=24.0.0`.** `@pulse-chat/shared` is ESM-only
  while the backend compiles to CommonJS, so the backend relies on Node's
  support for `require()` of ES modules (Node 22.12+). Backend container images
  must not use an older Node base image.
