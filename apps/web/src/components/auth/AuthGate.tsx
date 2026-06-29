import { useEffect, type ReactNode } from 'react';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

type AuthGateProps = {
  children: ReactNode;
  redirectTo?: string;
};

export function AuthGateInner({ children, redirectTo = '/' }: AuthGateProps) {
  const me = trpc.auth.me.useQuery();

  useEffect(() => {
    if (me.isError) {
      window.location.href = redirectTo;
    }
  }, [me.isError, redirectTo]);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-black)]">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Verifying access...
        </p>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return null;
  }

  return <>{children}</>;
}

export function AuthGate(props: AuthGateProps) {
  return (
    <TrpcProvider>
      <AuthGateInner {...props} />
    </TrpcProvider>
  );
}
