import type { ReactNode } from 'react';

interface StatusPanelProps {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
}

export function StatusPanel({ title, message, action }: StatusPanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {message}
      </p>
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ListSkeleton({
  label,
  rows = 5,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <ul aria-busy="true" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="h-11 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
      ))}
    </ul>
  );
}
