import { Component, type ErrorInfo, type ReactNode } from 'react';

import { toDisplayErrorMessage } from '../lib/errors';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/** Catches unexpected render errors anywhere below the application shell. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error details are surfaced through the fallback UI in this foundation phase.
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback(error, this.reset);
      }

      return (
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
          <section className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-rose-700">Something went wrong</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {toDisplayErrorMessage(error)}
            </p>
            <button
              type="button"
              className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={this.reset}
            >
              Try again
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
