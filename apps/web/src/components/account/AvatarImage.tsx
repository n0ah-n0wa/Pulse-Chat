import { initialsFor, resolveAvatarSrc } from '../../lib/avatar';

interface AvatarImageProps {
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly size?: 'md' | 'lg';
}

export function AvatarImage({ displayName, avatarUrl, size = 'md' }: AvatarImageProps) {
  const src = resolveAvatarSrc(avatarUrl);
  const dimension = size === 'lg' ? 'h-24 w-24 text-2xl' : 'h-12 w-12 text-sm';

  if (src !== undefined) {
    return (
      <img
        src={src}
        alt={`${displayName} avatar`}
        className={`${dimension} rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${dimension} inline-flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200`}
    >
      {initialsFor(displayName)}
    </span>
  );
}
