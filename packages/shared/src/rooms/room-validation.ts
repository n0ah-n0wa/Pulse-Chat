import { z } from 'zod';

import { MEMBERSHIP_ROLES } from './membership-role.js';
import { ROOM_TYPES } from './room-type.js';

/** Maximum length for a room name. */
export const ROOM_NAME_MAX_LENGTH = 64;

/** Maximum length for a room description. */
export const ROOM_DESCRIPTION_MAX_LENGTH = 500;

/** Canonical 24-character hex id used in room request bodies. */
export const roomResourceIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'must be a valid id');

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(ROOM_NAME_MAX_LENGTH, `Name must be at most ${String(ROOM_NAME_MAX_LENGTH)} characters`);

export const roomDescriptionSchema = z
  .string()
  .trim()
  .max(
    ROOM_DESCRIPTION_MAX_LENGTH,
    `Description must be at most ${String(ROOM_DESCRIPTION_MAX_LENGTH)} characters`,
  );

export const createRoomSchema = z
  .object({
    type: z.enum([ROOM_TYPES.PUBLIC, ROOM_TYPES.PRIVATE, ROOM_TYPES.DIRECT]),
    name: roomNameSchema.optional(),
    description: roomDescriptionSchema.optional(),
    peerUserId: roomResourceIdSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === ROOM_TYPES.DIRECT) {
      if (value.peerUserId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['peerUserId'],
          message: 'Peer user is required for direct rooms',
        });
      }
      return;
    }

    if (value.name === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Name is required',
      });
    }

    if (value.peerUserId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['peerUserId'],
        message: 'Peer user is only valid for direct rooms',
      });
    }
  });

export const updateRoomSchema = z
  .object({
    name: roomNameSchema.optional(),
    description: roomDescriptionSchema.optional(),
    ownerId: roomResourceIdSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.ownerId !== undefined,
    { message: 'At least one room field must be provided' },
  );

export const addRoomMemberSchema = z
  .object({
    userId: roomResourceIdSchema,
    role: z.enum([MEMBERSHIP_ROLES.MEMBER, MEMBERSHIP_ROLES.MODERATOR]).optional(),
  })
  .strict();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type AddRoomMemberInput = z.infer<typeof addRoomMemberSchema>;
