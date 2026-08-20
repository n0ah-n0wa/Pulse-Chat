/**
 * Prepares user input for MongoDB `$text` search.
 *
 * Each token is wrapped in quotes so `-`, `"`, and other text-search operators
 * are treated as literal characters rather than syntax.
 */
export function sanitizeTextSearchQuery(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const withoutSyntaxBreakers = collapsed.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();

  if (withoutSyntaxBreakers.length === 0) {
    return '';
  }

  return withoutSyntaxBreakers
    .split(' ')
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '')}"`)
    .join(' ');
}
