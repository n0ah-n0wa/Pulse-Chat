/** Converts config duration strings such as `15m` or `30d` to seconds. */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (match === null) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

/** Converts config duration strings to milliseconds. */
export function parseDurationToMilliseconds(duration: string): number {
  return parseDurationToSeconds(duration) * 1000;
}

/** Converts config duration strings to a future {@link Date}. */
export function addDurationToDate(duration: string, from = new Date()): Date {
  return new Date(from.getTime() + parseDurationToMilliseconds(duration));
}
