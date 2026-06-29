import { useState, useEffect } from 'react';
import { ManageGroupPage } from '../../components/groups/ManageGroupPage';
import { JoinGroupPage } from '../../components/groups/JoinGroupPage';

function JoinRouterInner() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get('token');
    if (queryToken) {
      setToken(queryToken);
      setReady(true);
      return;
    }

    const match = window.location.pathname.match(/\/join\/([^/]+)/);
    const pathToken = match?.[1];
    if (pathToken && pathToken !== '_') {
      window.location.replace(`/join?token=${encodeURIComponent(pathToken)}`);
      return;
    }

    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading...
        </p>
      </div>
    );
  }

  if (token) {
    return <JoinGroupPage token={token} />;
  }

  return <ManageGroupPage />;
}

export function JoinRouter() {
  return <JoinRouterInner />;
}
