import { describe, expect, it } from 'vitest';

import { initialsFor, resolveAvatarSrc } from './avatar';

describe('avatar helpers', () => {
  it('prefixes relative avatar paths with the API origin', () => {
    expect(resolveAvatarSrc('/api/users/1/avatar')).toBe('/api/users/1/avatar');
    expect(resolveAvatarSrc('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
    expect(resolveAvatarSrc(undefined)).toBeUndefined();
  });

  it('builds initials from a display name', () => {
    expect(initialsFor('Alice')).toBe('AL');
    expect(initialsFor('Alice Smith')).toBe('AS');
  });
});
