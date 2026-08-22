import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { useThemeSync } from '../hooks/useTheme';
import { queryClient } from '../lib/query-client';
import { appRouter } from '../routes/router';

function ThemeRoot() {
  useThemeSync();
  return <RouterProvider router={appRouter} />;
}

export function AppProviders() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeRoot />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
