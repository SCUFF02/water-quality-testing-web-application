import { Navigate, Outlet } from "react-router-dom";
import { isAuthed } from "../auth/auth";

export default function ProtectedRoute() {
  return isAuthed() ? <Outlet /> : <Navigate to="/signin" />;
}