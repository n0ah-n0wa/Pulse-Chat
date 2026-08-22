import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ATTACHMENT_MAX_BYTES, API_ERROR_CODES, type AttachmentResponse } from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ApiException } from '../common/errors/api.exception.js';
import { RateLimited } from '../rate-limit/rate-limit.decorator.js';
import { RATE_LIMIT_ACTIONS } from '../rate-limit/rate-limit.keys.js';
import { UserRateLimitGuard } from '../rate-limit/user-rate-limit.guard.js';
import { AttachmentsService } from './attachments.service.js';
import type { UploadedMultipartFile } from './uploaded-multipart-file.js';
import { contentDispositionHeader } from './utils/content-disposition-header.js';

const uploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
});

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(AuthGuard, UserRateLimitGuard)
@Controller('rooms/:roomId/attachments')
export class RoomAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @HttpCode(201)
  @RateLimited(RATE_LIMIT_ACTIONS.UPLOADS)
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload an attachment for a room' })
  upload(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('roomId') roomId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<AttachmentResponse> {
    if (file === undefined) {
      throw new ApiException(
        API_ERROR_CODES.VALIDATION_FAILED,
        'File is required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.attachmentsService.uploadAttachment(
      currentUser.userId,
      roomId,
      file.buffer,
      file.originalname,
    );
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an uploaded attachment' })
  delete(@CurrentUser() currentUser: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.attachmentsService.deleteAttachment(currentUser.userId, id);
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':key')
  @ApiOperation({ summary: 'Download an attachment file' })
  async download(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('key') key: string,
    @Res() response: Response,
  ): Promise<void> {
    const readable = await this.attachmentsService.openAttachmentFile(currentUser.userId, key);
    response.setHeader('Content-Type', readable.mimeType);
    response.setHeader(
      'Content-Disposition',
      contentDispositionHeader(readable.filename, readable.mimeType),
    );
    readable.stream.pipe(response);
  }
}
