/**
 * HTTP client — all API calls go through here.
 *
 * Security features:
 * - Auto-attaches JWT token to every request
 * - Checks token expiry before sending — auto-logs out if expired
 * - Handles 401 responses by clearing session and redirecting to login
 */

const BASE_URL = "http://localhost:8000";

// Check if a JWT token is expired by reading the exp field from the payload
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // payload.exp is in seconds, Date.now() is in milliseconds
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // if we can't decode it, treat it as expired
  }
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  window.location.href = "/signin";
}

async function request(method: string, path: string, body?: unknown) {
  const token = localStorage.getItem("token");

  // Auto-logout if token is expired before even making the request
  if (token && isTokenExpired(token)) {
    clearSession();
    throw new Error("Session expired");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If server says token is invalid/expired, clear session
  if (res.status === 401) {
    clearSession();
    throw new Error("Session expired");
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Request failed");
  }

  return data;
}

export const http = {
  get:    (path: string)                => request("GET",    path),
  post:   (path: string, body: unknown) => request("POST",   path, body),
  put:    (path: string, body: unknown) => request("PUT",    path, body),
  patch:  (path: string, body: unknown) => request("PATCH",  path, body),
  delete: (path: string)                => request("DELETE", path),
};