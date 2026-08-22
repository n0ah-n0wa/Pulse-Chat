import type {
  CreateRoomInput,
  MarkRoomReadInput,
  RoomMemberResponse,
  RoomResponse,
} from '@pulse-chat/shared';

import { apiClient } from './api-client';

export const roomsService = {
  list(): Promise<RoomResponse[]> {
    return apiClient.get<RoomResponse[]>('/api/rooms');
  },

  create(input: CreateRoomInput): Promise<RoomResponse> {
    return apiClient.post<RoomResponse>('/api/rooms', input);
  },

  join(roomId: string): Promise<RoomMemberResponse> {
    return apiClient.post<RoomMemberResponse>(`/api/rooms/${roomId}/join`);
  },

  get(roomId: string): Promise<RoomResponse> {
    return apiClient.get<RoomResponse>(`/api/rooms/${roomId}`);
  },

  listMembers(roomId: string): Promise<RoomMemberResponse[]> {
    return apiClient.get<RoomMemberResponse[]>(`/api/rooms/${roomId}/members`);
  },

  markRead(roomId: string, input: MarkRoomReadInput): Promise<RoomMemberResponse> {
    return apiClient.post<RoomMemberResponse>(`/api/rooms/${roomId}/read`, input);
  },
};
