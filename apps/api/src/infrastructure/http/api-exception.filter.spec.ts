import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { API_ERROR_CODES, ATTACHMENT_ERROR_CODES, ATTACHMENT_MAX_BYTES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import type { RequestContextService } from '../logging/request-context.service.js';
import type { StructuredLoggerService } from '../logging/structured-logger.service.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function createHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status, json, getHeader: vi.fn() };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

function createFilter(requestId?: string): ApiExceptionFilter {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

  const requestContext = {
    getRequestId: vi.fn().mockReturnValue(requestId),
    run: vi.fn(),
  } satisfies Pick<RequestContextService, 'getRequestId' | 'run'>;

  return new ApiExceptionFilter(
    logger as unknown as StructuredLoggerService,
    requestContext as unknown as RequestContextService,
  );
}

describe('ApiExceptionFilter', () => {
  it('formats ApiException responses per the specification', () => {
    const { host, status, json } = createHost();
    const filter = createFilter('req-123');

    filter.catch(
      new ApiException(
        API_ERROR_CODES.FORBIDDEN,
        'You do not have access to this room.',
        HttpStatus.FORBIDDEN,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      code: API_ERROR_CODES.FORBIDDEN,
      message: 'You do not have access to this room.',
    });
  });

  it('maps Zod validation failures to VALIDATION_FAILED', () => {
    const { host, status, json } = createHost();
    const filter = createFilter();

    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'not-an-email' });
    if (result.success) {
      throw new Error('expected validation failure');
    }

    filter.catch(result.error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = json.mock.calls[0]?.[0] as { message: string; code: string; statusCode: number };
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    expect(body.message).toContain('email');
  });

  it('does not expose stack traces for unknown errors', () => {
    const { host, json } = createHost();
    const filter = createFilter();

    filter.catch(new Error('database exploded'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    });
  });

  it('normalises Nest HttpException responses', () => {
    const { host, json } = createHost();
    const filter = createFilter();

    filter.catch(new NotFoundException('Route missing'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      code: API_ERROR_CODES.NOT_FOUND,
      message: 'Route missing',
    });
  });

  it('preserves BadRequestException bodies that already follow the API shape', () => {
    const { host, json } = createHost();
    const filter = createFilter();

    filter.catch(
      new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: API_ERROR_CODES.VALIDATION_FAILED,
        message: 'Validation failed: name: Required',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: API_ERROR_CODES.VALIDATION_FAILED,
      message: 'Validation failed: name: Required',
    });
  });

  it('maps payload-too-large upload failures to FILE_TOO_LARGE', () => {
    const { host, json } = createHost();
    const filter = createFilter();

    filter.catch(new PayloadTooLargeException('File too large'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE,
      message: `File exceeds the ${String(ATTACHMENT_MAX_BYTES)} byte limit.`,
    });
  });

  it('maps Multer file-size errors to FILE_TOO_LARGE', () => {
    const { host, json } = createHost();
    const filter = createFilter();

    filter.catch(
      Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE,
      message: `File exceeds the ${String(ATTACHMENT_MAX_BYTES)} byte limit.`,
    });
  });
});
