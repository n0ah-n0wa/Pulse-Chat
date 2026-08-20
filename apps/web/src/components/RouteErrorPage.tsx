import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { toDisplayErrorMessage } from '../lib/errors';

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'The requested page could not be loaded.'
    : toDisplayErrorMessage(error);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-rose-700">Route error</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
      </section>
    </main>
  );
}
