import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    username: z.string().min(3).max(32),
  });

  it('returns parsed data when validation succeeds', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ username: 'alex' })).toEqual({ username: 'alex' });
  });

  it('throws a BadRequestException with a machine-readable code when validation fails', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ username: 'a' })).toThrow(BadRequestException);

    try {
      pipe.transform({ username: 'a' });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        statusCode: number;
        code: string;
        message: string;
      };
      expect(response.statusCode).toBe(400);
      expect(response.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(response.message).toContain('username');
    }
  });
});
