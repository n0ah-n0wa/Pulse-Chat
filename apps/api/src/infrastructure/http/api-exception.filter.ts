import {
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

import {
  API_ERROR_CODES,
  ATTACHMENT_ERROR_CODES,
  ATTACHMENT_MAX_BYTES,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import { formatZodValidationMessage } from '../../common/validation/format-zod-validation-message.js';
import { RequestContextService } from '../logging/request-context.service.js';
import { StructuredLoggerService } from '../logging/structured-logger.service.js';

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = this.requestContext.getRequestId();
    const body = this.toErrorBody(exception);
    const logContext = {
      ...(requestId ? { requestId } : {}),
      code: body.code,
      statusCode: body.statusCode,
      message: body.message,
    };

    if (body.statusCode >= 500) {
      this.logger.error(
        'http.exception',
        logContext,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn('http.exception', logContext);
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ApiException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        return response as ApiErrorBody;
      }
    }

    if (exception instanceof BadRequestException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        return response as ApiErrorBody;
      }
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: API_ERROR_CODES.VALIDATION_FAILED,
        message: formatZodValidationMessage(exception),
      };
    }

    if (isMulterException(exception)) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE,
          message: `File exceeds the ${String(ATTACHMENT_MAX_BYTES)} byte limit.`,
        };
      }

      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: API_ERROR_CODES.BAD_REQUEST,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      if (statusCode === 413) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE,
          message: `File exceeds the ${String(ATTACHMENT_MAX_BYTES)} byte limit.`,
        };
      }

      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response &&
              typeof response.message === 'string'
            ? response.message
            : exception.message;

      return {
        statusCode,
        code: this.codeForStatus(statusCode),
        message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };
  }

  private codeForStatus(statusCode: number): ApiErrorCode {
    if (statusCode === 400) {
      return API_ERROR_CODES.BAD_REQUEST;
    }
    if (statusCode === 401) {
      return API_ERROR_CODES.UNAUTHORIZED;
    }
    if (statusCode === 403) {
      return API_ERROR_CODES.FORBIDDEN;
    }
    if (statusCode === 404) {
      return API_ERROR_CODES.NOT_FOUND;
    }
    if (statusCode === 429) {
      return API_ERROR_CODES.TOO_MANY_REQUESTS;
    }
    return API_ERROR_CODES.INTERNAL_ERROR;
  }
}

function isMulterException(
  exception: unknown,
): exception is { readonly code: string; readonly message: string; readonly name: 'MulterError' } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'name' in exception &&
    exception.name === 'MulterError' &&
    'code' in exception &&
    typeof exception.code === 'string'
  );
}
