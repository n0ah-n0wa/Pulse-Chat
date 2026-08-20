import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES } from './membership-role.js';
import { ROOM_TYPES } from './room-type.js';
import { addRoomMemberSchema, createRoomSchema, updateRoomSchema } from './room-validation.js';

describe('createRoomSchema', () => {
  it('accepts a public room with a name', () => {
    expect(
      createRoomSchema.parse({
        type: ROOM_TYPES.PUBLIC,
        name: 'General',
        description: 'Company-wide',
      }),
    ).toMatchObject({
      type: ROOM_TYPES.PUBLIC,
      name: 'General',
    });
  });

  it('requires a name for private rooms', () => {
    expect(() =>
      createRoomSchema.parse({
        type: ROOM_TYPES.PRIVATE,
      }),
    ).toThrow(/Name is required/);
  });

  it('requires a peer user for direct rooms', () => {
    expect(() =>
      createRoomSchema.parse({
        type: ROOM_TYPES.DIRECT,
      }),
    ).toThrow(/Peer user is required/);
  });

  it('rejects a peer user on public rooms', () => {
    expect(() =>
      createRoomSchema.parse({
        type: ROOM_TYPES.PUBLIC,
        name: 'General',
        peerUserId: '507f1f77bcf86cd799439011',
      }),
    ).toThrow(/only valid for direct rooms/);
  });
});

describe('updateRoomSchema', () => {
  it('requires at least one field', () => {
    expect(() => updateRoomSchema.parse({})).toThrow(/At least one room field/);
  });
});

describe('addRoomMemberSchema', () => {
  it('rejects assigning owner through member creation', () => {
    expect(() =>
      addRoomMemberSchema.parse({
        userId: '507f1f77bcf86cd799439011',
        role: MEMBERSHIP_ROLES.OWNER,
      }),
    ).toThrow();
  });
});
