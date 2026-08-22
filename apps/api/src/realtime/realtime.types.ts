import type { ClientToServerEvents, ServerToClientEvents } from '@pulse-chat/shared';
import type { Socket } from 'socket.io';

export interface AuthenticatedSocketData {
  userId: string;
  requestId?: string;
}

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  AuthenticatedSocketData
>;
