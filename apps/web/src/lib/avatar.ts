import { getApiBaseUrl } from './env';

/** Resolves a profile avatar URL against the API origin for `<img src>`. */
export function resolveAvatarSrc(avatarUrl: string | undefined): string | undefined {
  if (avatarUrl === undefined || avatarUrl.length === 0) {
    return undefined;
  }

  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }

  return `${getApiBaseUrl()}${avatarUrl}`;
}

export function initialsFor(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.[0];
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first ?? '?'}${second ?? ''}`.toUpperCase();
}
