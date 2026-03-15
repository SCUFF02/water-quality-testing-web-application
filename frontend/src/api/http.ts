/**
 * HTTP client — all API calls go through here.
 *
 * Why this file exists:
 * Instead of writing fetch() everywhere, we have one place that:
 * 1. Always points to the right backend URL
 * 2. Always attaches the JWT token to requests automatically
 * 3. Handles 401 errors (expired token) by redirecting to login
 */

const BASE_URL = "http://localhost:8000";

async function request(method: string, path: string, body?: unknown) {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Attach JWT token to every request if we have one
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If server says token is invalid/expired, log out
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    window.location.href = "/signin";
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
  delete: (path: string)                => request("DELETE", path),
};