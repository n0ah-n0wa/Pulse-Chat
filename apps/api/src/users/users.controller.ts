import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import {
  ATTACHMENT_MAX_BYTES,
  API_ERROR_CODES,
  searchUsersQuerySchema,
  updateUserProfileSchema,
  type CurrentUserProfile,
  type PublicUserProfile,
  type SearchUsersQuery,
  type UpdateUserProfileInput,
} from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ApiException } from '../common/errors/api.exception.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { RateLimited } from '../rate-limit/rate-limit.decorator.js';
import { RATE_LIMIT_ACTIONS } from '../rate-limit/rate-limit.keys.js';
import { UserRateLimitGuard } from '../rate-limit/user-rate-limit.guard.js';
import type { UploadedMultipartFile } from '../attachments/uploaded-multipart-file.js';
import { UsersService } from './users.service.js';

const avatarUploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
});

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @UseGuards(AuthGuard, UserRateLimitGuard)
  @RateLimited(RATE_LIMIT_ACTIONS.SEARCH)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users by username or display name' })
  searchUsers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchUsersQuerySchema)) query: SearchUsersQuery,
  ): Promise<PublicUserProfile[]> {
    return this.usersService.searchPublicProfiles(currentUser.userId, query);
  }

  @Get('username/:username')
  @ApiOperation({ summary: 'Get a public user profile by username' })
  getUserByUsername(@Param('username') username: string): Promise<PublicUserProfile> {
    return this.usersService.getPublicProfileByUsername(username);
  }

  @Get(':id/avatar')
  @ApiOperation({ summary: 'Download a user avatar' })
  async getAvatar(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const readable = await this.usersService.openAvatar(id);
    response.setHeader('Content-Type', readable.mimeType);
    response.setHeader('Cache-Control', 'public, max-age=3600');
    readable.stream.pipe(response);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a public user profile by id' })
  getUser(@Param('id') id: string): Promise<PublicUserProfile> {
    return this.usersService.getPublicProfile(id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  updateMe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateUserProfileSchema)) body: UpdateUserProfileInput,
  ): Promise<CurrentUserProfile> {
    return this.usersService.updateCurrentUserProfile(currentUser.userId, body);
  }

  @Post('me/avatar')
  @HttpCode(201)
  @UseGuards(AuthGuard, UserRateLimitGuard)
  @RateLimited(RATE_LIMIT_ACTIONS.UPLOADS)
  @ApiBearerAuth()
  @UseInterceptors(avatarUploadInterceptor)
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
  @ApiOperation({ summary: 'Upload an avatar for the authenticated user' })
  uploadAvatar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<CurrentUserProfile> {
    if (file === undefined) {
      throw new ApiException(
        API_ERROR_CODES.VALIDATION_FAILED,
        'File is required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.usersService.uploadAvatar(currentUser.userId, file.buffer, file.originalname);
  }
}
