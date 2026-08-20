/** Room visibility and conversation kind (specification section 10). */
export const ROOM_TYPES = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  DIRECT: 'DIRECT',
} as const;

export type RoomType = (typeof ROOM_TYPES)[keyof typeof ROOM_TYPES];
