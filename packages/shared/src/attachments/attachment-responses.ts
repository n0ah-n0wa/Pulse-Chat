/** Attachment metadata returned by upload and message endpoints. */
export interface AttachmentResponse {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly url: string;
  readonly createdAt: string;
}
