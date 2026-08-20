import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <section className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Authentication UI will be implemented in a later phase. The auth store, API client, and
        React Hook Form + Zod integration are already in place for it.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Back to home
      </Link>
    </section>
  );
}
