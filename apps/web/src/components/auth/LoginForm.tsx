import { useEffect, useState, type FormEvent } from 'react';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';
import { getToken, setToken } from '../../lib/auth';
import { BRAND_NAME, BRAND_SUBTITLE, BRAND_TAGLINE } from '../../lib/brand';
import { awaitNativeDeepLinkBootstrap } from '../../lib/native-deep-link-pending';
import { formatRegisterPhonePreview } from '../../lib/phone-preview';
import { ThemeModeControl } from '../ThemeModeControl';
import { isSafeRelativeReturnTo } from '../../lib/safe-return-to';

type Tab = 'signin' | 'register';

function getReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('returnTo');
}

async function routeAfterAuth(_groupId: string | null | undefined) {
  await awaitNativeDeepLinkBootstrap();

  const returnTo = getReturnTo();
  if (returnTo && isSafeRelativeReturnTo(returnTo)) {
    window.location.href = returnTo;
    return;
  }
  window.location.href = '/dashboard';
}

function LoginFormInner() {
  const [tab, setTab] = useState<Tab>('signin');
  const [name, setName] = useState('');

  // Open the Register tab when redirected with `?mode=register` (e.g. from an
  // invite link whose session was stale, meaning the account no longer exists).
  // Set in an effect rather than the initial state to avoid an SSR/client
  // hydration mismatch on the tab styling.
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'register') setTab('register');
  }, []);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasToken = typeof window !== 'undefined' && Boolean(getToken());
  const me = trpc.auth.me.useQuery(undefined, {
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    if (!me.data) return;
    void routeAfterAuth(me.data.user.groupId);
  }, [me.data]);

  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setToken(data.token);
      void routeAfterAuth(data.user.groupId);
    },
    onError: (err) => setError(err.message),
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      setToken(data.token);
      void routeAfterAuth(data.user.groupId);
    },
    onError: (err) => setError(err.message),
  });

  const isPending = login.isPending || register.isPending;
  const showPhonePrefix =
    tab === 'register' ||
    (tab === 'signin' && !phone.includes('@') && !phone.trim().startsWith('+'));
  const phonePreview =
    tab === 'register' ? formatRegisterPhonePreview(phone) : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (tab === 'signin') {
      login.mutate({ identifier: phone, password });
      return;
    }

    register.mutate({ name, phone, password });
  }

  // Hold the checking state while verifying AND once a valid session is found,
  // so the login form never flashes before the redirect effect navigates away.
  if (hasToken && (me.isLoading || me.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Checking session…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <h1
          className="text-5xl leading-none tracking-wide text-[var(--accent-red)] sm:text-6xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {BRAND_NAME}
        </h1>
        <p
          className="mt-2 text-lg uppercase tracking-[0.35em] text-[var(--text-primary)] sm:text-xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {BRAND_SUBTITLE}
        </p>
      </div>

      <div className="w-full max-w-[420px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="mb-8 flex border-b border-[var(--border)]">
          {(['signin', 'register'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setError(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold uppercase tracking-wider transition ${
                tab === key
                  ? 'border-b-2 border-[var(--accent-red)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {key === 'signin' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] [font-family:var(--font-mono)]">
                Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] [font-family:var(--font-mono)]">
              {tab === 'signin' ? 'Phone or email' : 'Phone'}
            </label>
            <div className="flex">
              {showPhonePrefix && (
                <span className="inline-flex items-center rounded-l border border-r-0 border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-muted)]">
                  +91
                </span>
              )}
              <input
                type={tab === 'signin' ? 'text' : 'tel'}
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)] ${
                  showPhonePrefix ? 'rounded-r' : 'rounded'
                }`}
                placeholder={
                  tab === 'signin'
                    ? '9876543210 or you@example.com'
                    : '9876543210'
                }
              />
            </div>
            {phonePreview && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Will register as {phonePreview}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] [font-family:var(--font-mono)]">
              Password
            </label>
            <input
              type="password"
              required
              minLength={tab === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
              placeholder={tab === 'register' ? 'Min 8 characters' : '••••••••'}
            />
          </div>

          {error && (
            <p className="rounded border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 px-3 py-2 text-sm text-[var(--accent-red)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full rounded bg-[var(--accent-red)] py-3 text-sm font-bold uppercase tracking-widest text-[var(--text-on-accent)] transition hover:bg-[var(--accent-red-hover)] disabled:opacity-50"
          >
            {isPending
              ? 'Loading...'
              : tab === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>

      <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
        {BRAND_TAGLINE}
      </p>
      <div className="mt-4 flex justify-center">
        <ThemeModeControl compact />
      </div>
    </div>
  );
}

export function LoginForm() {
  return (
    <TrpcProvider>
      <LoginFormInner />
    </TrpcProvider>
  );
}
