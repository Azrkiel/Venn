/** Return destinations are exact local routes; never normalize an untrusted URL into an allowed path. */
export function safeSharedReturnPath(value: unknown): string | undefined {
  return typeof value === 'string' && /^\/r\/[A-Za-z0-9_-]{32,128}$/.test(value) ? value : undefined;
}

export function setupReturnPath(value: unknown, calendarStatus?: string): string {
  const params = new URLSearchParams();
  if (calendarStatus) params.set('calendar', calendarStatus);
  const shared = safeSharedReturnPath(value);
  if (shared) params.set('returnTo', shared);
  return `/setup${params.size ? `?${params}` : ''}`;
}

export function safeSignupReturnPath(value: unknown): string {
  if (value === '/venn' || value === '/live') return value;
  const shared = safeSharedReturnPath(value);
  if (shared) return shared;
  if (typeof value === 'string' && value.startsWith('/setup?')) {
    const params = new URLSearchParams(value.slice('/setup?'.length));
    const nested = safeSharedReturnPath(params.get('returnTo'));
    if (params.size === 1 && nested) return setupReturnPath(nested);
  }
  return '/venn';
}
