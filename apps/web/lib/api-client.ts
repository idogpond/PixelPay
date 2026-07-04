// Server-side (RSC) fetches may need a different host than the browser —
// e.g. in docker-compose the API is `api:3000` internally but `localhost:4000`
// from the host. API_URL_INTERNAL is only read server-side.
const BASE =
  (typeof window === 'undefined' ? process.env.API_URL_INTERNAL : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const token = accessToken ?? readCookie('pixelpay-token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url.toString(), { ...options, headers });
  const json = (res.status === 204 || res.status === 205) ? null : await res.json();

  if (res.status === 401 && typeof window !== 'undefined' && path !== '/auth/login') {
    document.cookie = 'pixelpay-token=; path=/; max-age=0';
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return (json?.data ?? null) as T;
}
