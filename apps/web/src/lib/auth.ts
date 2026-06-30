const TOKEN_KEY = 'drcode_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Clears the session token and returns the user to the login page. */
export function performClientLogout(): void {
  clearToken();
  window.location.href = '/';
}

export function getTimezoneHeader(): Record<string, string> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { 'x-timezone': timezone };
  } catch {
    return {};
  }
}
