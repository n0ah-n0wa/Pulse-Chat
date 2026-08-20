import type { CurrentUserProfile } from '@pulse-chat/shared';

export type {
  ApiErrorBody,
  ApiErrorCode,
  AuthSessionResponse,
  AuthTokensResponse,
  ClientToServerEvents,
  CurrentUserProfile,
  PublicUserProfile,
  ServerToClientEvents,
} from '@pulse-chat/shared';

/** Realtime transport state exposed to the UI (specification section 37). */
export type SocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'reconnected'
  | 'authentication_failed';

/** Session persisted locally until explicit logout. */
export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: CurrentUserProfile;
}
