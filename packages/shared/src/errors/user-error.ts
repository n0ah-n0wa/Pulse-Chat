/** Machine-readable codes for user-domain HTTP errors. */
export const USER_ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USERNAME_ALREADY_TAKEN: 'USERNAME_ALREADY_TAKEN',
} as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[keyof typeof USER_ERROR_CODES];
