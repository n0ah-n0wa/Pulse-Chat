# Observability

How the API records what happened, how those records stay safe to store, and
how orchestrators decide whether an instance may receive traffic. This maps to
specification sections 49–52.

## Structured logs

Production logs are one JSON object per line. Development keeps Nest's
readable format but still serializes the same fields (and the same redaction)
after the event name.

Every line includes:

| Field       | When it is present                                           |
| ----------- | ------------------------------------------------------------ |
| `timestamp` | Always, ISO-8601 UTC                                         |
| `level`     | Always (`log`, `warn`, `error`)                              |
| `event`     | Always, dotted name of the event                             |
| `requestId` | HTTP and WebSocket work running inside request context       |
| `userId`    | After a successful access-token check                        |
| `roomId`    | Socket payloads that carry a room id                         |
| `messageId` | Socket payloads that carry a message id                      |
| `duration`  | Timed HTTP responses and WebSocket handlers, in milliseconds |

Request-scoped fields are taken from `AsyncLocalStorage` so services do not
have to thread them through every call. Explicit fields on a log call override
the store.

### Events

| Event                          | Meaning                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `application.configured`       | Nest app assembled, about to listen                              |
| `application.listening`        | HTTP/WebSocket server is bound                                   |
| `application.shutting_down`    | SIGTERM/SIGINT (or `app.close`) began                            |
| `application.stopped`          | Shutdown hooks finished                                          |
| `http.request`                 | Response finished (method, path without query, status, duration) |
| `http.exception`               | Mapped API error; `error` is included only for 5xx               |
| `auth.failure`                 | Login, refresh, Bearer, or Socket.IO handshake rejected          |
| `ws.connect` / `ws.disconnect` | Authenticated socket attached or removed                         |
| `ws.event`                     | Successful `room:join`, `room:leave`, or `message:send`          |
| `ws.event_failed`              | Validation, domain, or unexpected socket handler failure         |
| `redis.connected`              | Client ready                                                     |
| `redis.error`                  | Client error (URI credentials stripped)                          |
| `redis.disconnected`           | Unexpected connection drop                                       |
| `redis.closed`                 | Graceful quit                                                    |
| `redis.subscriber_error`       | Pub/Sub subscriber error                                         |
| `mongodb.connected`            | Mongoose connected (or already connected at init)                |
| `mongodb.reconnected`          | Driver reconnected                                               |
| `mongodb.disconnected`         | Driver disconnected                                              |
| `mongodb.error`                | Driver error (URI credentials stripped)                          |
| `presence.*_failed`            | Presence connect/disconnect against Redis failed                 |
| `nest.log` / `nest.error`      | Framework logs bridged into the same JSON shape                  |

Health probes are not written as `http.request` lines.

Typing start/stop successes are not logged (high volume). Failures still emit
`ws.event_failed`.

## What is never logged

Redaction runs on every structured line before it is written:

- keys whose names look like passwords, tokens, JWTs, cookies, secrets, emails,
  or message `content`;
- Bearer tokens, JWT-shaped strings, emails, and Mongo/Redis URIs inside
  values, including `Error.message` and stacks.

Authentication failures record a `reason` and error `code` only. They do not
record the email, password, or token that was presented.

Access logs record method, path, status, duration, and ids. They do not record
request bodies, query strings, or headers.

## Request correlation

HTTP clients may send `X-Request-ID`. The API echoes a safe value (printable,
max 128 characters) or generates a UUID when the header is missing or invalid.
The same header is set on the response.

The identifier is stored in request context for the rest of that HTTP call, so
`http.request`, `http.exception`, and `auth.failure` share it.

WebSocket handshakes use the same header when the client sets it, otherwise a
new UUID. That value is stored on the socket and used for `ws.connect` /
`ws.disconnect`. Each subsequent socket event gets its own request id so
concurrent handlers on one connection stay distinguishable.

## Health checks

These routes are **not** under `/api`:

| Method | Path                | Purpose                                              |
| ------ | ------------------- | ---------------------------------------------------- |
| `GET`  | `/health`           | Aggregate JSON: process plus MongoDB and Redis pings |
| `GET`  | `/health/readiness` | Same payload; HTTP 503 when MongoDB or Redis fails   |
| `GET`  | `/health/liveness`  | `{ "status": "ok" }` with no dependency I/O          |

Readiness is what production compose and load balancers should call. Liveness
only answers “is this process still running?”. `GET /health` always returns
HTTP 200 even when a dependency check is `"error"`; only readiness uses 503.

Production nginx (`prod.conf`) proxies `/health` to the API. Development
nginx does not; compose still probes the API container on the Docker
network. See `docs/deployment.md`.

Every HTTP response, including probes, also carries `X-Pulse-Instance` so a
multi-instance deployment can be traced to a process.

## Shutdown

`enableShutdownHooks()` is on. SIGTERM/SIGINT log `application.shutting_down`,
then Nest stops accepting work, feature modules close MongoDB and Redis, and
`application.stopped` is logged last.
