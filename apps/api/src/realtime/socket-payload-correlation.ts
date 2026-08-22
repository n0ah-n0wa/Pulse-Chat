export function socketPayloadCorrelation(payload: unknown): {
  roomId?: string;
  messageId?: string;
} {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const roomId = record['roomId'];
  const messageId = record['messageId'];

  return {
    ...(typeof roomId === 'string' && roomId.length > 0 ? { roomId } : {}),
    ...(typeof messageId === 'string' && messageId.length > 0 ? { messageId } : {}),
  };
}
