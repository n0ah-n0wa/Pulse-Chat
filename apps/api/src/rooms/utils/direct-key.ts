/** Stable identity for a one-to-one room, independent of who created it. */
export function buildDirectKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}
