import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, ROOM_TYPES } from '@pulse-chat/shared';

import {
  canAssignModerator,
  canDeleteRoom,
  canJoinRoom,
  canManageMembers,
  canRemoveMember,
  canTransferOwnership,
  canUpdateRoomDescription,
  canUpdateRoomName,
  canViewRoom,
} from './room-permissions.js';

describe('room permissions', () => {
  const owner = { role: MEMBERSHIP_ROLES.OWNER };
  const moderator = { role: MEMBERSHIP_ROLES.MODERATOR };
  const member = { role: MEMBERSHIP_ROLES.MEMBER };

  it('lets anyone view a public room and only members view private or direct rooms', () => {
    expect(canViewRoom({ type: ROOM_TYPES.PUBLIC }, null)).toBe(true);
    expect(canViewRoom({ type: ROOM_TYPES.PRIVATE }, null)).toBe(false);
    expect(canViewRoom({ type: ROOM_TYPES.PRIVATE }, member)).toBe(true);
    expect(canViewRoom({ type: ROOM_TYPES.DIRECT }, null)).toBe(false);
    expect(canViewRoom({ type: ROOM_TYPES.DIRECT }, member)).toBe(true);
  });

  it('allows joining only public rooms that the user is not already in', () => {
    expect(canJoinRoom({ type: ROOM_TYPES.PUBLIC }, null)).toBe(true);
    expect(canJoinRoom({ type: ROOM_TYPES.PUBLIC }, member)).toBe(false);
    expect(canJoinRoom({ type: ROOM_TYPES.PRIVATE }, null)).toBe(false);
    expect(canJoinRoom({ type: ROOM_TYPES.DIRECT }, null)).toBe(false);
  });

  it('restricts rename and ownership transfer to owners', () => {
    expect(canUpdateRoomName(owner)).toBe(true);
    expect(canUpdateRoomName(moderator)).toBe(false);
    expect(canUpdateRoomName(member)).toBe(false);
    expect(canTransferOwnership(owner)).toBe(true);
    expect(canTransferOwnership(moderator)).toBe(false);
  });

  it('lets owners and moderators change the description, but not members', () => {
    expect(canUpdateRoomDescription(owner)).toBe(true);
    expect(canUpdateRoomDescription(moderator)).toBe(true);
    expect(canUpdateRoomDescription(member)).toBe(false);
  });

  it('lets owners delete group rooms and either participant delete a direct room', () => {
    expect(canDeleteRoom({ type: ROOM_TYPES.PRIVATE }, owner)).toBe(true);
    expect(canDeleteRoom({ type: ROOM_TYPES.PRIVATE }, moderator)).toBe(false);
    expect(canDeleteRoom({ type: ROOM_TYPES.PRIVATE }, member)).toBe(false);
    expect(canDeleteRoom({ type: ROOM_TYPES.DIRECT }, member)).toBe(true);
    expect(canDeleteRoom({ type: ROOM_TYPES.DIRECT }, null)).toBe(false);
  });

  it('forbids member management in direct rooms and by members', () => {
    expect(canManageMembers({ type: ROOM_TYPES.PRIVATE }, moderator)).toBe(true);
    expect(canManageMembers({ type: ROOM_TYPES.PUBLIC }, member)).toBe(false);
    expect(canManageMembers({ type: ROOM_TYPES.DIRECT }, owner)).toBe(false);
    expect(canAssignModerator(owner)).toBe(true);
    expect(canAssignModerator(moderator)).toBe(false);
  });

  it('lets moderators remove members but not owners or other moderators', () => {
    expect(canRemoveMember(moderator, member)).toBe(true);
    expect(canRemoveMember(moderator, moderator)).toBe(false);
    expect(canRemoveMember(moderator, owner)).toBe(false);
    expect(canRemoveMember(owner, moderator)).toBe(true);
    expect(canRemoveMember(member, member)).toBe(false);
  });
});
