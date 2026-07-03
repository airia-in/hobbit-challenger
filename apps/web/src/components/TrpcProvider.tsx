import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { trpc, trpcClient } from '../lib/trpc';

let browserQueryClient: QueryClient | undefined;

// One QueryClient per browser session, reused across island remounts. Under the
// View Transitions router the JS runtime persists between page navigations, so a
// shared client keeps cached queries alive and pages no longer refetch from an
// empty cache on every click. On the server each call gets a fresh client so
// requests never share state.
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return new QueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient();
  }
  return browserQueryClient;
}

// Wrap any React island that needs tRPC with this provider.
// Place it at the top of your island tree.
export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
