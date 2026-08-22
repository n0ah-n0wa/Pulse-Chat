/** Escapes a string so it can be used as a literal in a `RegExp` source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
