export const queryKeys = {
  rooms: {
    all: ['rooms'] as const,
    list: () => [...queryKeys.rooms.all, 'list'] as const,
    detail: (roomId: string) => [...queryKeys.rooms.all, 'detail', roomId] as const,
    members: (roomId: string) => [...queryKeys.rooms.all, 'members', roomId] as const,
  },
  messages: {
    all: ['messages'] as const,
    list: (roomId: string) => [...queryKeys.messages.all, 'list', roomId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => [...queryKeys.notifications.all, 'list'] as const,
  },
  users: {
    all: ['users'] as const,
    profile: (userId: string) => [...queryKeys.users.all, 'profile', userId] as const,
    byUsername: (username: string) => [...queryKeys.users.all, 'username', username] as const,
    search: (query: string) => [...queryKeys.users.all, 'search', query] as const,
    me: () => [...queryKeys.users.all, 'me'] as const,
  },
};
