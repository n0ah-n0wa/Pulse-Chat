import type { ZodError } from 'zod';

/** Turns Zod issues into a single human-readable message for API clients. */
export function formatZodValidationMessage(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
    return `${path}: ${issue.message}`;
  });

  return issues.length === 1
    ? `Validation failed: ${issues[0] ?? 'invalid request'}`
    : `Validation failed: ${issues.join('; ')}`;
}
