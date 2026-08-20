import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
  type NotificationListResponse,
  type NotificationResponse,
} from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user, newest first' })
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery,
  ): Promise<NotificationListResponse> {
    return this.notificationsService.listNotifications(currentUser.userId, query);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationResponse> {
    return this.notificationsService.markRead(id, currentUser.userId);
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark all notifications for the authenticated user as read' })
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    return this.notificationsService.markAllRead(currentUser.userId);
  }
}
