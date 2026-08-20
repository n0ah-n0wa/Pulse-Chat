export function AppHomePage() {
  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Protected workspace</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        You reached an authenticated route. Room list, chat, and notifications UI will mount here
        in later phases.
      </p>
    </section>
  );
}
