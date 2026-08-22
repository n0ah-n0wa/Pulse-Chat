import { z } from 'zod';

import {
  clientMessageIdSchema,
  createMessageSchema,
  messageResourceIdSchema,
} from '../messages/message-validation.js';
import { roomResourceIdSchema } from '../rooms/room-validation.js';

export const socketHandshakeAuthSchema = z
  .object({
    token: z.string().trim().min(1, 'Token is required'),
  })
  .strict();

export const roomJoinEventSchema = z
  .object({
    roomId: roomResourceIdSchema,
  })
  .strict();

export const roomLeaveEventSchema = z
  .object({
    roomId: roomResourceIdSchema,
  })
  .strict();

export const messageSendEventSchema = createMessageSchema
  .extend({
    roomId: roomResourceIdSchema,
  })
  .strict();

export type SocketHandshakeAuth = z.infer<typeof socketHandshakeAuthSchema>;
export type RoomJoinEventInput = z.infer<typeof roomJoinEventSchema>;
export type RoomLeaveEventInput = z.infer<typeof roomLeaveEventSchema>;
export type MessageSendEventInput = z.infer<typeof messageSendEventSchema>;

export const typingRoomEventSchema = z
  .object({
    roomId: roomResourceIdSchema,
  })
  .strict();

export type TypingRoomEventInput = z.infer<typeof typingRoomEventSchema>;

export { messageResourceIdSchema, clientMessageIdSchema };
