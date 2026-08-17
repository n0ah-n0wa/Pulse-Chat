import { APP_NAME } from '@pulse-chat/shared';

export function App() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          The workspace foundation is ready. Application features are implemented in later phases,
          as described in the project specification.
        </p>
      </section>
    </main>
  );
}
