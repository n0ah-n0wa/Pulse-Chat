import type { MessageResponse } from '../messages/message-responses.js';
import type { NotificationResponse } from '../notifications/notification-responses.js';
import type { MessageSendEventInput } from './realtime-validation.js';
import type { RoomResponse } from '../rooms/room-responses.js';

/** Stable client event names for the Socket.IO transport. */
export const CLIENT_SOCKET_EVENTS = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  MESSAGE_SEND: 'message:send',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

/** Stable server event names for the Socket.IO transport. */
export const SERVER_SOCKET_EVENTS = {
  ROOM_JOINED: 'room:joined',
  ROOM_LEFT: 'room:left',
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  NOTIFICATION_NEW: 'notification:new',
  TYPING_STARTED: 'typing:started',
  TYPING_STOPPED: 'typing:stopped',
  ERROR: 'error',
} as const;

export interface RoomJoinEventInput {
  readonly roomId: string;
}

export interface RoomLeaveEventInput {
  readonly roomId: string;
}

export interface RoomJoinedEvent {
  readonly roomId: string;
  readonly room: RoomResponse;
}

export interface RoomLeftEvent {
  readonly roomId: string;
}

export interface MessageNewEvent {
  readonly message: MessageResponse;
}

export interface MessageUpdatedEvent {
  readonly message: MessageResponse;
}

export interface MessageDeletedEvent {
  readonly message: MessageResponse;
}

export interface UserOnlineEvent {
  readonly userId: string;
  readonly lastSeenAt: string;
}

export interface UserOfflineEvent {
  readonly userId: string;
  readonly lastSeenAt: string;
}

export interface ReactionChangedEvent {
  readonly roomId: string;
  readonly message: MessageResponse;
  readonly emoji: string;
  readonly userId: string;
}

export interface NotificationNewEvent {
  readonly notification: NotificationResponse;
}

export interface SocketErrorEvent {
  readonly code: string;
  readonly message: string;
}

/** Client signals the user started typing in a room (specification section 28). */
export interface TypingRoomEventInput {
  readonly roomId: string;
}

/** Server broadcasts that a user started typing. */
export interface TypingStartedEvent {
  readonly roomId: string;
  readonly userId: string;
}

/** Server broadcasts that a user stopped typing. */
export interface TypingStoppedEvent {
  readonly roomId: string;
  readonly userId: string;
}

export interface ClientToServerEvents {
  [CLIENT_SOCKET_EVENTS.ROOM_JOIN]: (payload: RoomJoinEventInput) => void;
  [CLIENT_SOCKET_EVENTS.ROOM_LEAVE]: (payload: RoomLeaveEventInput) => void;
  [CLIENT_SOCKET_EVENTS.MESSAGE_SEND]: (payload: MessageSendEventInput) => void;
  [CLIENT_SOCKET_EVENTS.TYPING_START]: (payload: TypingRoomEventInput) => void;
  [CLIENT_SOCKET_EVENTS.TYPING_STOP]: (payload: TypingRoomEventInput) => void;
}

export interface ServerToClientEvents {
  [SERVER_SOCKET_EVENTS.ROOM_JOINED]: (payload: RoomJoinedEvent) => void;
  [SERVER_SOCKET_EVENTS.ROOM_LEFT]: (payload: RoomLeftEvent) => void;
  [SERVER_SOCKET_EVENTS.MESSAGE_NEW]: (payload: MessageNewEvent) => void;
  [SERVER_SOCKET_EVENTS.MESSAGE_UPDATED]: (payload: MessageUpdatedEvent) => void;
  [SERVER_SOCKET_EVENTS.MESSAGE_DELETED]: (payload: MessageDeletedEvent) => void;
  [SERVER_SOCKET_EVENTS.REACTION_ADDED]: (payload: ReactionChangedEvent) => void;
  [SERVER_SOCKET_EVENTS.REACTION_REMOVED]: (payload: ReactionChangedEvent) => void;
  [SERVER_SOCKET_EVENTS.USER_ONLINE]: (payload: UserOnlineEvent) => void;
  [SERVER_SOCKET_EVENTS.USER_OFFLINE]: (payload: UserOfflineEvent) => void;
  [SERVER_SOCKET_EVENTS.NOTIFICATION_NEW]: (payload: NotificationNewEvent) => void;
  [SERVER_SOCKET_EVENTS.TYPING_STARTED]: (payload: TypingStartedEvent) => void;
  [SERVER_SOCKET_EVENTS.TYPING_STOPPED]: (payload: TypingStoppedEvent) => void;
  [SERVER_SOCKET_EVENTS.ERROR]: (payload: SocketErrorEvent) => void;
}
