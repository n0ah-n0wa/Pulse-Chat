/** Domain representation of a persisted attachment. */
export interface AttachmentRecord {
  readonly id: string;
  readonly roomId: string;
  readonly uploaderId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly messageId?: string;
  readonly deletedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAttachmentRecordInput {
  readonly roomId: string;
  readonly uploaderId: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** Data-access contract for attachment metadata. */
export interface AttachmentRepository {
  create(input: CreateAttachmentRecordInput): Promise<AttachmentRecord>;
  findById(id: string): Promise<AttachmentRecord | null>;
  findByIds(ids: readonly string[]): Promise<AttachmentRecord[]>;
  findByStorageKey(storageKey: string): Promise<AttachmentRecord | null>;
  /**
   * Claims every id for `messageId`, or claims none if any id is already linked.
   * Returns whether the full set was claimed.
   */
  linkToMessage(ids: readonly string[], messageId: string): Promise<boolean>;
  softDelete(id: string, deletedAt: Date): Promise<AttachmentRecord | null>;
}
