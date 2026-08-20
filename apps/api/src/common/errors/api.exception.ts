import { HttpException, HttpStatus } from '@nestjs/common';

import type {
  ApiErrorBody,
  ApiErrorCode,
  AttachmentErrorCode,
  AuthErrorCode,
  MessageErrorCode,
  NotificationErrorCode,
  RoomErrorCode,
  UserErrorCode,
} from '@pulse-chat/shared';

/**
 * Application-level HTTP exception with a machine-readable {@link code}.
 */
export class ApiException extends HttpException {
  readonly code:
    | ApiErrorCode
    | AttachmentErrorCode
    | AuthErrorCode
    | MessageErrorCode
    | NotificationErrorCode
    | RoomErrorCode
    | UserErrorCode;

  constructor(
    code:
      | ApiErrorCode
      | AttachmentErrorCode
      | AuthErrorCode
      | MessageErrorCode
      | NotificationErrorCode
      | RoomErrorCode
      | UserErrorCode,
    message: string,
    statusCode: HttpStatus,
  ) {
    const body: ApiErrorBody = { statusCode, code, message };
    super(body, statusCode);
    this.code = code;
  }
}
