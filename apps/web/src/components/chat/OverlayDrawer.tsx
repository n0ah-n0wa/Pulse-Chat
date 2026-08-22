import { useEffect, type ReactNode } from 'react';

interface OverlayDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly side: 'left' | 'right';
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function OverlayDrawer({ open, title, side, onClose, children }: OverlayDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const titleId = side === 'left' ? 'room-drawer-title' : 'member-drawer-title';
  const positionClass = side === 'left' ? 'left-0' : 'right-0';

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute top-0 ${positionClass} flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-xl dark:bg-slate-900`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
