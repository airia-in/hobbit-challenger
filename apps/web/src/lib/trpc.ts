import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@workspace-starter/api';
import { getToken, getTimezoneHeader } from './auth';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const trpcLinkOptions = {
  url: `${apiUrl}/trpc`,
  headers() {
    return { ...authHeaders(), ...getTimezoneHeader() };
  },
};

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [httpBatchLink(trpcLinkOptions)],
});

export const trpcVanilla = createTRPCClient<AppRouter>({
  links: [httpBatchLink(trpcLinkOptions)],
});
