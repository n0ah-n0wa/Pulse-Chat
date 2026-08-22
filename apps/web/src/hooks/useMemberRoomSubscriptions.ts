import { useEffect, useMemo } from 'react';

import { getSocketService } from '../services/socket-service';
import { useRoomsQuery } from './useRoomsQuery';

/**
 * Keep Socket.IO room subscriptions for every membership so inactive rooms
 * still receive message:new (unread counts) and presence fan-out.
 */
export function useMemberRoomSubscriptions(): void {
  const roomsQuery = useRoomsQuery();
  const memberRoomKey = useMemo(() => {
    const ids = (roomsQuery.data ?? [])
      .filter((room) => room.currentUserRole !== undefined)
      .map((room) => room.id)
      .sort();
    return ids.join(',');
  }, [roomsQuery.data]);

  useEffect(() => {
    if (memberRoomKey.length === 0) {
      return;
    }

    const roomIds = memberRoomKey.split(',');
    const releases = roomIds.map((roomId) => getSocketService().acquireRoom(roomId));

    return () => {
      for (const release of releases) {
        release();
      }
    };
  }, [memberRoomKey]);
}
