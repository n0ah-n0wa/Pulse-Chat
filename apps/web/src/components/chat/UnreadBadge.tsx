interface UnreadBadgeProps {
  readonly count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : String(count);

  return (
    <span
      aria-label={`${label} unread messages`}
      className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
    >
      {label}
    </span>
  );
}
