import { Link } from 'react-router-dom';

import { APP_NAME } from '@pulse-chat/shared';

export function HomePage() {
  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        The frontend foundation is ready: routing, API client, TanStack Query, Zustand auth state,
        and the Socket.IO service are wired up. Feature UI arrives in later phases.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/app"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Open protected area
        </Link>
        <Link
          to="/login"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Create account
        </Link>
      </div>
    </section>
  );
}
