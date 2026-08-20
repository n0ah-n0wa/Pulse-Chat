/** Machine-readable codes for user-domain HTTP errors. */
export const USER_ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[keyof typeof USER_ERROR_CODES];
