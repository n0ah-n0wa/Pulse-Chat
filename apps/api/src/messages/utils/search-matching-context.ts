const DEFAULT_SNIPPET_RADIUS = 40;
const DEFAULT_MAX_SNIPPET_LENGTH = 120;

/** Builds a short excerpt around the first case-insensitive match of `query`. */
export function buildSearchMatchingContext(
  content: string,
  query: string,
  maxLength = DEFAULT_MAX_SNIPPET_LENGTH,
): string {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return truncate(content, maxLength);
  }

  const lowerContent = content.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return truncate(content, maxLength);
  }

  const start = Math.max(0, matchIndex - DEFAULT_SNIPPET_RADIUS);
  const end = Math.min(
    content.length,
    matchIndex + normalizedQuery.length + DEFAULT_SNIPPET_RADIUS,
  );
  let snippet = content.slice(start, end);

  if (start > 0) {
    snippet = `...${snippet}`;
  }
  if (end < content.length) {
    snippet = `${snippet}...`;
  }

  return truncate(snippet, maxLength);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
