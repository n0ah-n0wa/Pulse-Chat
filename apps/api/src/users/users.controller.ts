import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  updateUserProfileSchema,
  type CurrentUserProfile,
  type PublicUserProfile,
  type UpdateUserProfileInput,
} from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
