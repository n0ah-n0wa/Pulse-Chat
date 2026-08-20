import type { ReactNode } from 'react';

interface AuthCardProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <section
      aria-labelledby="auth-card-title"
      className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h1 id="auth-card-title" className="text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-6 space-y-4">{children}</div>
      {footer !== undefined ? (
        <div className="mt-6 border-t border-slate-100 pt-4">{footer}</div>
      ) : null}
    </section>
  );
}
