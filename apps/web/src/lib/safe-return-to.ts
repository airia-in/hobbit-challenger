/**
 * Same-origin relative path only; blocks `//evil.com` and absolute URL open redirects.
 */
export function isSafeRelativeReturnTo(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }

  try {
    const resolved = new URL(path, window.location.origin);
    return (
      resolved.origin === window.location.origin &&
      resolved.pathname.startsWith('/')
    );
  } catch {
    return false;
  }
}
