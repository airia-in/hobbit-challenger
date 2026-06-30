import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearToken,
  getToken,
  performClientLogout,
  setToken,
} from '../src/lib/auth';

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  vi.stubGlobal('localStorage', localStorage);
  return store;
}

describe('auth', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and clears the session token', () => {
    setToken('test-jwt');
    expect(getToken()).toBe('test-jwt');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('performs client logout by clearing token and redirecting home', () => {
    setToken('test-jwt');
    const location = { href: '/profile' };
    vi.stubGlobal('location', location);

    performClientLogout();

    expect(getToken()).toBeNull();
    expect(location.href).toBe('/');
  });
});
