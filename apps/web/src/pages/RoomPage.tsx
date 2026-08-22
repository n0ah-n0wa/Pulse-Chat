import { useParams } from 'react-router-dom';

import { ChatPane } from '../components/chat/ChatPane';
import { StatusPanel } from '../components/chat/StatusPanel';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  if (roomId === undefined) {
    return (
      <StatusPanel title="Missing room" message="The room identifier is missing from the URL." />
    );
  }

  return <ChatPane roomId={roomId} />;
}
