import { useSocketStore } from '../store/socket-store';

export function useSocketConnectionState() {
  return useSocketStore((state) => state.connectionState);
}
