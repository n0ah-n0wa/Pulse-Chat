export interface ConfigValidationIssue {
  readonly variable: string;
  readonly message: string;
}

/**
 * Raised when environment configuration fails validation. The message lists
 * every problem so operators can fix their `.env` in one pass.
 */
export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigValidationIssue[];

  constructor(issues: readonly ConfigValidationIssue[]) {
    super(formatConfigValidationMessage(issues));
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

export function formatConfigValidationMessage(issues: readonly ConfigValidationIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`);
  return [
    'Invalid environment configuration:',
    ...lines,
    '',
    'Copy .env.example to .env and set every required variable.',
  ].join('\n');
}
