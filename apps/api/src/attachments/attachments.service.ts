import { createReadStream } from 'node:fs';
import path from 'node:path';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  ATTACHMENT_ERROR_CODES,
  MESSAGE_MAX_ATTACHMENTS,
  type AttachmentResponse,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { AppConfigService } from '../config/index.js';
import { FileUploadService } from '../infrastructure/storage/file-upload.service.js';
import { canDeleteMessage } from '../messages/message-permissions.js';
import type { MessageRepository } from '../messages/message.repository.interface.js';
import { MESSAGE_REPOSITORY } from '../messages/messages.tokens.js';
import type { RoomMemberRecord } from '../rooms/room-member.repository.interface.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { toAttachmentResponse } from './attachment.mapper.js';
import type { AttachmentRecord, AttachmentRepository } from './attachment.repository.interface.js';
import { ATTACHMENT_REPOSITORY } from './attachments.tokens.js';

export interface ReadableAttachmentFile {
  readonly stream: ReturnType<typeof createReadStream>;
  readonly mimeType: string;
  readonly filename: string;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY) private readonly attachments: AttachmentRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    private readonly fileUploads: FileUploadService,
    private readonly roomsService: RoomsService,
    private readonly config: AppConfigService,
  ) {}

  async uploadAttachment(
    userId: string,
    roomId: string,
    buffer: Buffer,
    declaredFilename?: string,
  ): Promise<AttachmentResponse> {
    await this.roomsService.requireMember(userId, roomId);

    const stored = await this.fileUploads.upload({
      buffer,
      declaredFilename,
    });

    const record = await this.attachments.create({
      roomId,
      uploaderId: userId,
      storageKey: stored.key,
      filename: stored.filename,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });

    return toAttachmentResponse(record, stored.url);
  }

  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.requireAttachment(attachmentId);
    const membership = await this.roomsService.requireMember(userId, attachment.roomId);
    await this.assertCanDeleteAttachment(userId, attachment, membership);

    if (attachment.messageId !== undefined) {
      await this.messages.removeAttachmentReference(attachment.messageId, attachment.id);
    }

    const deleted = await this.attachments.softDelete(attachment.id, new Date());
    if (deleted === null) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_NOT_FOUND,
        'Attachment not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.fileUploads.delete(attachment.storageKey);
  }

  async resolveAttachmentsForMessage(
    userId: string,
    roomId: string,
    attachmentIds: readonly string[] | undefined,
  ): Promise<readonly AttachmentRecord[]> {
    if (attachmentIds === undefined || attachmentIds.length === 0) {
      return [];
    }

    if (attachmentIds.length > MESSAGE_MAX_ATTACHMENTS) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_LIMIT_EXCEEDED,
        `A message cannot have more than ${String(MESSAGE_MAX_ATTACHMENTS)} attachments.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.roomsService.requireMember(userId, roomId);

    const uniqueIds = [...new Set(attachmentIds)];
    if (uniqueIds.length !== attachmentIds.length) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
        'Duplicate attachment ids are not allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.attachments.findByIds(uniqueIds);
    const recordMap = new Map(records.map((record) => [record.id, record]));

    for (const attachmentId of uniqueIds) {
      const record = recordMap.get(attachmentId);
      if (record === undefined || record.deletedAt !== undefined) {
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.ATTACHMENT_NOT_FOUND,
          'Attachment not found.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (record.roomId !== roomId) {
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
          'Attachment does not belong to this room.',
          HttpStatus.FORBIDDEN,
        );
      }

      if (record.uploaderId !== userId) {
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
          'You can only attach files you uploaded.',
          HttpStatus.FORBIDDEN,
        );
      }

      if (record.messageId !== undefined) {
        throw new ApiException(
          ATTACHMENT_ERROR_CODES.ATTACHMENT_ALREADY_LINKED,
          'Attachment is already linked to a message.',
          HttpStatus.CONFLICT,
        );
      }
    }

    return uniqueIds.map((id) => recordMap.get(id)!);
  }

  async linkAttachmentsToMessage(
    attachmentIds: readonly string[],
    messageId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }

    await this.attachments.linkToMessage(attachmentIds, messageId);
  }

  async hydrateAttachmentResponses(
    attachmentRefs: readonly { readonly id: string }[],
  ): Promise<AttachmentResponse[]> {
    if (attachmentRefs.length === 0) {
      return [];
    }

    const records = await this.attachments.findByIds(
      attachmentRefs.map((reference) => reference.id),
    );
    const recordMap = new Map(records.map((record) => [record.id, record]));
    const responses: AttachmentResponse[] = [];

    for (const reference of attachmentRefs) {
      const record = recordMap.get(reference.id);
      if (record === undefined || record.deletedAt !== undefined) {
        continue;
      }

      const url = await this.fileUploads.getUrl(record.storageKey);
      responses.push(toAttachmentResponse(record, url));
    }

    return responses;
  }

  async openAttachmentFile(userId: string, storageKey: string): Promise<ReadableAttachmentFile> {
    const attachment = await this.attachments.findByStorageKey(storageKey);
    if (attachment === undefined || attachment === null || attachment.deletedAt !== undefined) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND,
        'File not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.roomsService.requireMember(userId, attachment.roomId);

    if (this.config.fileStorage.provider !== 'local') {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND,
        'Direct file download is not available for this storage provider.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const storageRoot = this.config.fileStorage.path;
    if (storageRoot === undefined || storageRoot.trim().length === 0) {
      throw new Error('FILE_STORAGE_PATH is required for the local storage provider.');
    }

    const absolutePath = path.join(path.resolve(storageRoot), attachment.storageKey);

    return {
      stream: createReadStream(absolutePath),
      mimeType: attachment.mimeType,
      filename: attachment.filename,
    };
  }

  private async requireAttachment(attachmentId: string): Promise<AttachmentRecord> {
    const attachment = await this.attachments.findById(attachmentId);
    if (attachment === null || attachment.deletedAt !== undefined) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_NOT_FOUND,
        'Attachment not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return attachment;
  }

  private async assertCanDeleteAttachment(
    userId: string,
    attachment: AttachmentRecord,
    membership: RoomMemberRecord,
  ): Promise<void> {
    if (attachment.uploaderId === userId) {
      return;
    }

    if (attachment.messageId === undefined) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
        'You do not have permission to delete this attachment.',
        HttpStatus.FORBIDDEN,
      );
    }

    const message = await this.messages.findById(attachment.messageId);
    if (message === null) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
        'You do not have permission to delete this attachment.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!canDeleteMessage(userId, message.authorId, membership)) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.ATTACHMENT_ACCESS_DENIED,
        'You do not have permission to delete this attachment.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
