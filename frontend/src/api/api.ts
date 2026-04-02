/**
 * Central API helper — use this instead of raw fetch() in every page.
 * Change BASE_URL here and it updates everywhere at once.
 * For deployment: set VITE_API_URL in your .env.production file.
 */

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function getToken(): string {
  return localStorage.getItem("token") || "";
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch { return true; }
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  window.location.href = "/signin";
}

export async function apiFetch(
  path: string,
  opts: RequestInit = {},
  skipAuth = false
): Promise<Response> {
  const token = getToken();

  if (!skipAuth && token && isTokenExpired(token)) {
    clearSession();
    throw new Error("Session expired");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };

  if (!skipAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });

  if (res.status === 401 && !skipAuth) {
    clearSession();
    throw new Error("Session expired");
  }

  return res;
}

/** Shorthand helpers */
export const api = {
  get:   (path: string)                => apiFetch(path),
  post:  (path: string, body: unknown) => apiFetch(path, { method: "POST",  body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  del:   (path: string)                => apiFetch(path, { method: "DELETE" }),
  /** For auth endpoints that don't need a token */
  postPublic: (path: string, body: unknown) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }, true),
};