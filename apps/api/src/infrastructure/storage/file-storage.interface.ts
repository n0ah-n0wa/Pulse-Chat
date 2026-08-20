/** Untrusted upload payload accepted by the validation layer. */
export interface FileUploadInput {
  readonly buffer: Buffer;
  /** Ignored for trust decisions; retained for logging only. */
  readonly declaredMimeType?: string;
  /** Used only as a hint for display-name sanitization, never for storage paths. */
  readonly declaredFilename?: string;
}

/** Server-validated upload ready for a {@link FileStorage} provider. */
export interface ValidatedFileUpload {
  readonly buffer: Buffer;
  readonly key: string;
  readonly mimeType: string;
  readonly filename: string;
}

/** Metadata returned after a successful upload. */
export interface FileStorageUploadResult {
  readonly key: string;
  readonly url: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly filename: string;
}

/**
 * Provider-agnostic attachment storage contract (specification section 18).
 *
 * Implementations may use a local filesystem, S3-compatible object storage, or
 * any other backend. Message and upload business logic must depend on this
 * interface rather than on provider-specific APIs.
 */
export interface FileStorage {
  upload(input: ValidatedFileUpload): Promise<FileStorageUploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
