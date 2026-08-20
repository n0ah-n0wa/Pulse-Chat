import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm text-slate-600">The route you requested does not exist.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Go home
        </Link>
      </section>
    </main>
  );
}
