import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

export type CreatePrismaClientOptions = {
  databaseUrl?: string;
  authToken?: string;
};

// The libSQL client `Config`, derived via the adapter's constructor so we don't
// import the ESM-only `@libsql/client` package directly (this package compiles
// to CommonJS). Shared by the runtime adapter and the migration applier.
export type LibsqlConfig = NonNullable<
  ConstructorParameters<typeof PrismaLibSQL>[0]
>;
type LibsqlFetch = NonNullable<LibsqlConfig['fetch']>;

// Local development uses a file-based SQLite URL and Prisma's built-in engine.
// Every remote libSQL/sqld server (Turso or self-hosted) is reached over one of
// the libSQL client schemes below and must go through the driver adapter.
const LIBSQL_SCHEMES = ['libsql:', 'http:', 'https:', 'ws:', 'wss:'];

export function shouldUseLibsqlAdapter(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') {
    return false;
  }
  return LIBSQL_SCHEMES.some((scheme) => trimmed.startsWith(scheme));
}

type SplitCredentials = {
  cleanUrl: string;
  username?: string;
  password?: string;
};

// The libSQL client (via undici's fetch) rejects URLs that embed credentials
// ("Request cannot be constructed from a URL that includes credentials"), so we
// strip any `user:pass@` userinfo here and re-apply it as an HTTP Basic auth
// header through a custom fetch. Scheme-agnostic on purpose: WHATWG `URL`
// mangles non-special schemes like `libsql:`.
function splitCredentials(url: string): SplitCredentials {
  const match = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/@]+)@(.*)$/s);
  if (!match) {
    return { cleanUrl: url };
  }
  const [, prefix, userinfo, rest] = match;
  const separator = userinfo.indexOf(':');
  const username =
    separator === -1 ? userinfo : userinfo.slice(0, separator);
  const password =
    separator === -1 ? undefined : userinfo.slice(separator + 1);
  return {
    cleanUrl: `${prefix}${rest}`,
    username: decodeURIComponent(username),
    password: password === undefined ? undefined : decodeURIComponent(password),
  };
}

/**
 * Build the `@libsql/client` connection config for a libSQL `DATABASE_URL`,
 * or `undefined` for local file-based SQLite. Shared by the runtime Prisma
 * adapter and the standalone migration applier so credential handling stays in
 * one place.
 */
export function buildLibsqlConfig(
  options: CreatePrismaClientOptions = {},
): LibsqlConfig | undefined {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!shouldUseLibsqlAdapter(databaseUrl)) {
    return undefined;
  }

  const authToken = options.authToken ?? process.env.DATABASE_AUTH_TOKEN;
  const { cleanUrl, username, password } = splitCredentials(databaseUrl);

  if (username !== undefined && password !== undefined) {
    const basic = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    // Config['fetch'] is loosely typed as `Function`; derive params from `fetch`
    // to annotate them without naming DOM globals (RequestInit, etc.).
    const customFetch = ((
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const request = new Request(input, init);
      request.headers.set('Authorization', basic);
      return fetch(request);
    }) as LibsqlFetch;
    return { url: cleanUrl, authToken, fetch: customFetch };
  }

  return { url: cleanUrl, authToken };
}

export function getPrismaClientOptions(
  options: CreatePrismaClientOptions = {},
): ConstructorParameters<typeof PrismaClient>[0] | undefined {
  const config = buildLibsqlConfig(options);
  if (!config) {
    return undefined;
  }

  const adapter = new PrismaLibSQL(config);
  return { adapter };
}

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const clientOptions = getPrismaClientOptions(options);
  return clientOptions ? new PrismaClient(clientOptions) : new PrismaClient();
}
