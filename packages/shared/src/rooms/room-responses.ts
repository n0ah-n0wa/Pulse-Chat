import type { MembershipRole } from './membership-role.js';
import type { RoomType } from './room-type.js';

/** Room payload returned by REST room endpoints. */
export interface RoomResponse {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly type: RoomType;
  readonly ownerId?: string;
  /** The other participant in a direct room, from the current user's perspective. */
  readonly peerUserId?: string;
  /** Username of {@link peerUserId}, included so directory search does not need a second round trip. */
  readonly peerUsername?: string;
  /** Display name of {@link peerUserId}, included so directory search does not need a second round trip. */
  readonly peerDisplayName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentUserRole?: MembershipRole;
  /** Last message the current user has read in this room (when they are a member). */
  readonly lastReadMessageId?: string;
  readonly lastReadAt?: string;
}

/** Membership payload returned by room member endpoints. */
export interface RoomMemberResponse {
  readonly id: string;
  readonly roomId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly joinedAt: string;
  readonly lastReadMessageId?: string;
  readonly lastReadAt?: string;
}
