import { Link } from 'react-router-dom';

import { APP_NAME } from '@pulse-chat/shared';

export function HomePage() {
  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        The frontend foundation is ready: routing, API client, TanStack Query, Zustand auth state,
        and the Socket.IO service are wired up. Feature UI arrives in later phases.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/app"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Open protected area
        </Link>
        <Link
          to="/login"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Create account
        </Link>
      </div>
    </section>
  );
}
