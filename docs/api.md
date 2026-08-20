# REST API

Conventions for the Pulse Chat HTTP API (specification sections 31–32). OpenAPI
is served from `/api/docs` in non-production environments.

## Authentication

Protected routes require a Bearer access token:

```http
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/register` or `POST /api/auth/login`.

## Error format

```json
{
  "statusCode": 403,
  "code": "ROOM_ACCESS_DENIED",
  "message": "You do not have access to this room."
}
```

Every error includes an HTTP status, a machine-readable `code`, and a human-readable `message`.

## Attachments

Binary files are stored outside MongoDB. Messages reference attachments by id
only; upload responses and message payloads include metadata and a download URL.

### Upload

```http
POST /api/rooms/:roomId/attachments
Content-Type: multipart/form-data
```

| Field | Type   | Required | Description       |
| ----- | ------ | -------- | ----------------- |
| file  | binary | yes      | Image or document |

**Authorization:** room member.

**Validation:**

- Maximum size: 10 MiB (`ATTACHMENT_MAX_BYTES`)
- Allowed types (detected from file content, not client headers): JPEG, PNG, GIF, WebP, PDF, plain text
- Filenames are sanitized; storage keys are server-generated

**Response `201`:** `AttachmentResponse`

```json
{
  "id": "507f1f77bcf86cd799439060",
  "filename": "screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 512,
  "url": "/api/files/<storage-key>",
  "createdAt": "2026-08-20T00:00:00.000Z"
}
```

**Errors:**

| Code                | When                                 |
| ------------------- | ------------------------------------ |
| `FILE_TOO_LARGE`    | Exceeds 10 MiB                       |
| `INVALID_FILE_TYPE` | Content not allowed                  |
| `INVALID_FILENAME`  | Filename unusable after sanitization |
| `NOT_A_MEMBER`      | Caller is not a room member          |

### Download

```http
GET /api/files/:key
```

**Authorization:** member of the room that owns the attachment.

Returns the file bytes with `Content-Type` set from stored metadata. Local
development uses filesystem storage; object storage backends may use presigned
URLs later.

### Delete

```http
DELETE /api/attachments/:id
```

**Authorization:**

- Unlinked upload: uploader only
- Linked to a message: uploader, message author, or room moderator/owner (same rules as message delete)

**Response:** `204 No Content`

Removes the file from storage and soft-deletes metadata. If the attachment was
linked to a message, the reference is removed from that message.

### Messages with attachments

Upload attachments first, then create a message referencing them:

```http
POST /api/rooms/:roomId/messages
Content-Type: application/json

{
  "content": "See attached files",
  "clientMessageId": "client-unique-id",
  "attachmentIds": ["507f1f77bcf86cd799439060"]
}
```

| Field           | Max | Notes                                                                                        |
| --------------- | --- | -------------------------------------------------------------------------------------------- |
| `attachmentIds` | 10  | Must be ids returned from upload; same room; uploader must be the caller; not already linked |

Message list/history responses include full `AttachmentResponse` objects under
each message's `attachments` array. Deleted messages redact attachment metadata
in API responses.

**Errors:**

| Code                        | When                                         |
| --------------------------- | -------------------------------------------- |
| `ATTACHMENT_NOT_FOUND`      | Unknown or deleted id                        |
| `ATTACHMENT_ACCESS_DENIED`  | Wrong room, wrong uploader, or duplicate ids |
| `ATTACHMENT_ALREADY_LINKED` | Attachment already used on another message   |
| `ATTACHMENT_LIMIT_EXCEEDED` | More than 10 attachments                     |

## Messages (summary)

| Method | Path                                | Description                               |
| ------ | ----------------------------------- | ----------------------------------------- |
| GET    | `/api/rooms/:id/messages`           | Cursor-paginated history                  |
| GET    | `/api/rooms/:id/messages/search?q=` | Search within room                        |
| POST   | `/api/rooms/:id/messages`           | Create message (optional `attachmentIds`) |
| PATCH  | `/api/messages/:id`                 | Edit message                              |
| DELETE | `/api/messages/:id`                 | Soft-delete message                       |

See `SPECIFICATION.md` sections 12–20 for pagination, search, and validation rules.
