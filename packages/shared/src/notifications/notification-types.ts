/** All notification kinds the system can produce. */
export const NOTIFICATION_TYPES = {
  /** Someone @-mentioned the user in a message. */
  MENTION: 'mention',
  /** Someone replied to the user's message. */
  REPLY: 'reply',
  /** A new direct message was sent to the user. */
  DIRECT_MESSAGE: 'direct_message',
  /** The user was invited/added to a room. */
  ROOM_INVITATION: 'room_invitation',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
