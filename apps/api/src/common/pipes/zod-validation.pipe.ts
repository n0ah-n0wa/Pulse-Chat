import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { formatZodValidationMessage } from '../validation/format-zod-validation-message.js';

/**
 * Validates request input with a Zod schema.
 *
 * Feature modules attach this pipe per handler or parameter rather than relying
 * on class-validator DTOs, keeping validation aligned with {@link @pulse-chat/shared}.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: API_ERROR_CODES.VALIDATION_FAILED,
        message: formatZodValidationMessage(result.error),
      });
    }

    return result.data;
  }
}
