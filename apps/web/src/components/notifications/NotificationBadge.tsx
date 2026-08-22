import { useUnreadNotificationCount } from '../../hooks/useUnreadNotificationCount';

interface NotificationBadgeProps {
  readonly count: number;
  readonly className?: string;
}

export function NotificationBadge({ count, className = '' }: NotificationBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : String(count);

  return (
    <span
      aria-label={`${label} unread notifications`}
      className={[
        'inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white',
        className,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

export function NotificationBellBadge() {
  const count = useUnreadNotificationCount();
  return <NotificationBadge count={count} />;
}
