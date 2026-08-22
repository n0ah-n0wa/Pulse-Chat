# ADR-006: Local disk for attachment bytes (no S3 adapter)

- Status: Accepted
- Date: 2026-08-22

## Context

Messages must not embed file bytes. Specification section 18 allows a
storage provider switch (`local` | `s3`). Production compose runs two
API processes that must both read an upload.

## Decision

Implement `FileStorage` with `LocalFileStorage` only. Keys are
`<uuid>.<detected-extension>`. Bytes live under `FILE_STORAGE_PATH`.
Metadata (filename, mime, size, room, uploader, optional message id)
lives in MongoDB.

`FILE_STORAGE_PROVIDER=s3` is parsed as a valid enum value and then
**throws at module init** (`StorageModule`). There are no AWS SDKs and
no presigned URL routes.

Production compose mounts a shared `api-storage` volume on `api-1` and
`api-2`. Downloads require a Bearer token and room membership; the SPA
uses authenticated fetch + blob URLs.

## Alternatives considered

- **S3 / MinIO.** Correct for multi-host without a shared volume; not
  implemented. Shipping a fake “S3” that still writes to disk would
  mislead operators.
- **GridFS.** Keeps files in MongoDB; fights the “bytes outside the
  message document” rule and bloats the database volume.
- **Anonymous `/api/files`.** Simpler `<img src>`, but leaks any
  guessed UUID to the internet. Rejected.

## Consequences

- More than one host without a shared filesystem cannot serve uploads
  until an object-storage adapter exists.
- Volume backups are part of disaster recovery for chat files.
- Magic-byte sniffing and `Content-Disposition` stay in the API
  regardless of future backends.
