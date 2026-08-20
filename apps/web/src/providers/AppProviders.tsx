import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { queryClient } from '../lib/query-client';
import { appRouter } from '../routes/router';

export function AppProviders() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={appRouter} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
