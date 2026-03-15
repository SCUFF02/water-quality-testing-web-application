import { Navigate, Outlet } from "react-router-dom";
import { isAuthed } from "../auth/auth";

/**
 * ProtectedRoute — blocks unauthenticated users.
 * If the user is not logged in, sends them to /signin.
 * If they are logged in, renders the child route (via <Outlet />).
 *
 * Note: AppRouter.tsx has more specific guards per route (admin, researcher, etc.)
 * This component is a generic fallback you can use for any protected route.
 */
export default function ProtectedRoute() {
  return isAuthed() ? <Outlet /> : <Navigate to="/signin" replace />;
}