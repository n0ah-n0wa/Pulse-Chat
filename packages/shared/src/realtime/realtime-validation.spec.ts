import { describe, expect, it } from 'vitest';

import {
  roomJoinEventSchema,
  roomLeaveEventSchema,
  messageSendEventSchema,
  socketHandshakeAuthSchema,
} from './realtime-validation.js';

describe('socketHandshakeAuthSchema', () => {
  it('accepts a trimmed handshake token', () => {
    expect(socketHandshakeAuthSchema.parse({ token: '  token  ' })).toEqual({ token: 'token' });
  });

  it('rejects a missing token', () => {
    expect(() => socketHandshakeAuthSchema.parse({ token: ' ' })).toThrow(/Token is required/);
  });
});

describe('room socket event schemas', () => {
  it('accepts a canonical room id for join and leave', () => {
    expect(roomJoinEventSchema.parse({ roomId: '507f1f77bcf86cd799439011' })).toEqual({
      roomId: '507f1f77bcf86cd799439011',
    });
    expect(roomLeaveEventSchema.parse({ roomId: '507f1f77bcf86cd799439011' })).toEqual({
      roomId: '507f1f77bcf86cd799439011',
    });
  });

  it('rejects malformed room ids', () => {
    expect(() => roomJoinEventSchema.parse({ roomId: 'bad-id' })).toThrow();
    expect(() => roomLeaveEventSchema.parse({ roomId: 'bad-id' })).toThrow();
  });
});

describe('messageSendEventSchema', () => {
  it('accepts a valid realtime message payload', () => {
    expect(
      messageSendEventSchema.parse({
        roomId: '507f1f77bcf86cd799439011',
        content: 'Hello',
        clientMessageId: 'client-1',
      }),
    ).toEqual({
      roomId: '507f1f77bcf86cd799439011',
      content: 'Hello',
      clientMessageId: 'client-1',
    });
  });

  it('rejects empty content and malformed room ids', () => {
    expect(() =>
      messageSendEventSchema.parse({
        roomId: '507f1f77bcf86cd799439011',
        content: ' ',
        clientMessageId: 'client-1',
      }),
    ).toThrow();
    expect(() =>
      messageSendEventSchema.parse({
        roomId: 'bad-id',
        content: 'Hello',
        clientMessageId: 'client-1',
      }),
    ).toThrow();
  });
});
