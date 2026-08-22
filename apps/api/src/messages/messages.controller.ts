import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  addReactionSchema,
  createMessageSchema,
  listMessagesQuerySchema,
  reactionEmojiSchema,
  searchMessagesQuerySchema,
  updateMessageSchema,
  type AddReactionInput,
  type CreateMessageInput,
  type ListMessagesQuery,
  type MessageListResponse,
  type MessageResponse,
  type MessageSearchListResponse,
  type SearchMessagesQuery,
  type UpdateMessageInput,
} from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { RateLimited } from '../rate-limit/rate-limit.decorator.js';
import { RATE_LIMIT_ACTIONS } from '../rate-limit/rate-limit.keys.js';
import { UserRateLimitGuard } from '../rate-limit/user-rate-limit.guard.js';
import { RealtimeMessageBroadcastService } from '../realtime/realtime-message-broadcast.service.js';
import { MessagesService } from './messages.service.js';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(AuthGuard, UserRateLimitGuard)
@Controller('rooms/:id/messages')
export class RoomMessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly realtimeBroadcast: RealtimeMessageBroadcastService,
  ) {}

  @Get('search')
  @RateLimited(RATE_LIMIT_ACTIONS.SEARCH)
  @ApiOperation({ summary: 'Search messages in a room' })
  searchMessages(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') roomId: string,
    @Query(new ZodValidationPipe(searchMessagesQuerySchema)) query: SearchMessagesQuery,
  ): Promise<MessageSearchListResponse> {
    return this.messagesService.searchMessages(currentUser.userId, roomId, query);
  }

  @Get()
  @ApiOperation({ summary: 'List recent messages in a room, newest first' })
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') roomId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ): Promise<MessageListResponse> {
    return this.messagesService.listMessages(currentUser.userId, roomId, query);
  }

  @Post()
  @RateLimited(RATE_LIMIT_ACTIONS.MESSAGES)
  @ApiOperation({ summary: 'Create a message in a room' })
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput,
  ): Promise<MessageResponse> {
    return this.messagesService
      .createMessage(currentUser.userId, roomId, body)
      .then(async (result) => {
        if (result.created) {
          await this.realtimeBroadcast.broadcastNew(roomId, result.message);
        }

        return result.message;
      });
  }
}

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(AuthGuard, UserRateLimitGuard)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly realtimeBroadcast: RealtimeMessageBroadcastService,
  ) {}

  @Patch(':id')
  @RateLimited(RATE_LIMIT_ACTIONS.MESSAGES)
  @ApiOperation({ summary: 'Edit a message' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageInput,
  ): Promise<MessageResponse> {
    const message = await this.messagesService.updateMessage(currentUser.userId, id, body);
    await this.realtimeBroadcast.broadcastUpdated(message.roomId, message);
    return message;
  }

  @Delete(':id')
  @HttpCode(204)
  @RateLimited(RATE_LIMIT_ACTIONS.MESSAGES)
  @ApiOperation({ summary: 'Soft-delete a message' })
  async delete(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    const message = await this.messagesService.deleteMessage(currentUser.userId, id);
    await this.realtimeBroadcast.broadcastDeleted(message.roomId, message);
  }

  @Post(':id/reactions')
  @RateLimited(RATE_LIMIT_ACTIONS.MESSAGES)
  @ApiOperation({ summary: 'Toggle a reaction on a message' })
  async react(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addReactionSchema)) body: AddReactionInput,
  ): Promise<MessageResponse> {
    const message = await this.messagesService.toggleReaction(currentUser.userId, id, body);
    const added = message.reactions.some(
      (reaction) => reaction.emoji === body.emoji.trim() && reaction.reactedByCurrentUser,
    );
    const event = {
      roomId: message.roomId,
      message,
      emoji: body.emoji.trim(),
      userId: currentUser.userId,
    };

    if (added) {
      await this.realtimeBroadcast.broadcastReactionAdded(event);
    } else {
      await this.realtimeBroadcast.broadcastReactionRemoved(event);
    }

    return message;
  }

  @Delete(':id/reactions/:emoji')
  @RateLimited(RATE_LIMIT_ACTIONS.MESSAGES)
  @ApiOperation({ summary: 'Remove a reaction from a message' })
  async removeReaction(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Param('emoji', new ZodValidationPipe(reactionEmojiSchema)) emoji: string,
  ): Promise<MessageResponse> {
    const message = await this.messagesService.removeReaction(currentUser.userId, id, emoji);
    await this.realtimeBroadcast.broadcastReactionRemoved({
      roomId: message.roomId,
      message,
      emoji: emoji.trim(),
      userId: currentUser.userId,
    });
    return message;
  }
}
