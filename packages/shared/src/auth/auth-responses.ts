import type { CurrentUserProfile } from '../users/user-profile.js';

/** OAuth2-style token type returned by authentication endpoints. */
export const TOKEN_TYPE = 'Bearer' as const;

/** Token pair returned by login, registration and refresh. */
export interface AuthTokensResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresIn: number;
  readonly tokenType: typeof TOKEN_TYPE;
}

/** Registration and login responses include the current user profile. */
export interface AuthSessionResponse extends AuthTokensResponse {
  readonly user: CurrentUserProfile;
}
