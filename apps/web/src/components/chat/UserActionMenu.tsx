import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useOpenDirectRoom } from '../../hooks/useRoomMutations';
import { toDisplayErrorMessage } from '../../lib/errors';

interface UserActionMenuProps {
  readonly userId: string;
  readonly username?: string;
  readonly displayName: string;
  readonly className?: string;
}

export function UserActionMenu({ userId, username, displayName, className }: UserActionMenuProps) {
  const { user: currentUser, isAuthenticated } = useAuth();
  const openDirectRoom = useOpenDirectRoom();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isSelf = currentUser?.id === userId;
  const canViewProfile = username !== undefined && username.length > 0;
  const canMessage = isAuthenticated && !isSelf;
  const hasActions = canViewProfile || canMessage;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target) !== true) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (!hasActions) {
    return <span className={className}>{displayName}</span>;
  }

  const errorMessage =
    openDirectRoom.error !== null && openDirectRoom.error !== undefined
      ? toDisplayErrorMessage(openDirectRoom.error, 'Unable to open a direct message.')
      : undefined;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={
          className ??
          'rounded-sm font-medium text-slate-900 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:text-slate-50'
        }
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {displayName}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`${displayName} actions`}
          className="absolute left-0 z-30 mt-1 min-w-[10rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {canViewProfile ? (
            <Link
              role="menuitem"
              to={`/profile/${encodeURIComponent(username)}`}
              className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                setOpen(false);
              }}
            >
              View profile
            </Link>
          ) : null}
          {canMessage ? (
            <button
              type="button"
              role="menuitem"
              disabled={openDirectRoom.isPending}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                openDirectRoom.mutate(userId, {
                  onSuccess: () => {
                    setOpen(false);
                  },
                });
              }}
            >
              {openDirectRoom.isPending ? 'Opening…' : 'Message'}
            </button>
          ) : null}
          {errorMessage !== undefined ? (
            <p role="alert" className="px-3 py-1.5 text-xs text-rose-700 dark:text-rose-400">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
