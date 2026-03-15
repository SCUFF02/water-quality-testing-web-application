/**
 * Auth helper functions.
 *
 * isAuthed() — checks if the user has a token (is logged in)
 * Used by ProtectedRoute to block unauthenticated access.
 */

export function isAuthed(): boolean {
  return !!localStorage.getItem("token");
}

export function getRole(): string {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "{}").role || "";
  } catch {
    return "";
  }
}

export function getUsername(): string {
  try {
    return JSON.parse(localStorage.getItem("currentUser") || "{}").username || "";
  } catch {
    return "";
  }
}

export function logout(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  window.location.href = "/signin";
}