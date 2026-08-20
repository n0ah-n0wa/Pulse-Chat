import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  addRoomMemberSchema,
  createRoomSchema,
  updateRoomSchema,
  type AddRoomMemberInput,
  type CreateRoomInput,
  type RoomMemberResponse,
  type RoomResponse,
  type UpdateRoomInput,
} from '@pulse-chat/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List rooms visible to the current user' })
  list(@CurrentUser() currentUser: AuthenticatedUser): Promise<RoomResponse[]> {
    return this.roomsService.listRooms(currentUser.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a public, private, or direct room' })
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(createRoomSchema)) body: CreateRoomInput,
  ): Promise<RoomResponse> {
    return this.roomsService.createRoom(currentUser.userId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a room by id' })
  get(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RoomResponse> {
    return this.roomsService.getRoom(currentUser.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update room settings or transfer ownership' })
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) body: UpdateRoomInput,
  ): Promise<RoomResponse> {
    return this.roomsService.updateRoom(currentUser.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a room' })
  delete(@CurrentUser() currentUser: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.roomsService.deleteRoom(currentUser.userId, id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a public room' })
  join(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RoomMemberResponse> {
    return this.roomsService.joinRoom(currentUser.userId, id);
  }

  @Post(':id/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave a room' })
  leave(@CurrentUser() currentUser: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.roomsService.leaveRoom(currentUser.userId, id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List members of a room' })
  listMembers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RoomMemberResponse[]> {
    return this.roomsService.listMembers(currentUser.userId, id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a room' })
  addMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addRoomMemberSchema)) body: AddRoomMemberInput,
  ): Promise<RoomMemberResponse> {
    return this.roomsService.addMember(currentUser.userId, id, body);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a member from a room' })
  removeMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.roomsService.removeMember(currentUser.userId, id, userId);
  }
}
