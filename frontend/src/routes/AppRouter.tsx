import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignInPage        from "../pages/SignInPage";
import SignUpPage        from "../pages/SignUpPage";
import DashboardPage     from "../pages/DashboardPage";
import ProjectDataPage   from "../pages/ProjectDataPage";
import ProfilePage       from "../pages/ProfilePage";
import AdminPage         from "../pages/AdminPage";
import ResearcherPage    from "../pages/ResearcherPage";
import PublicProfilePage from "../pages/PublicProfilePage";
import MergedProjectPage from "../pages/MergedProjectPage";
import { getRole }       from "../auth/auth";

/**
 * AppRouter — controls which page the user sees based on their role.
 *
 * Route guards explained:
 * - UserRoute:          only users and researchers can access (admins go to /admin)
 * - AdminRoute:         only admins can access (others go to /app)
 * - ResearcherRoute:    only researchers can access (users go to /app, admins to /admin)
 * - PublicProfileRoute: admins and researchers can access
 *
 * REMOVED: seedAdmin() — admin is now created in the database, not localStorage.
 * To create the first admin, either:
 *   Option A: Register normally then run this SQL in phpMyAdmin:
 *     UPDATE users SET role='admin' WHERE email='admin@certe.tn';
 *   Option B: Use the /auth/register endpoint directly with role="admin" once,
 *     then remove that ability for security.
 */

function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

function UserRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn())            return <Navigate to="/signin" replace />;
  if (getRole() === "admin")    return <Navigate to="/admin"  replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn())            return <Navigate to="/signin" replace />;
  if (getRole() !== "admin")    return <Navigate to="/app"    replace />;
  return <>{children}</>;
}

function ResearcherRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn())              return <Navigate to="/signin" replace />;
  const role = getRole();
  if (role === "admin")           return <Navigate to="/admin"  replace />;
  if (role !== "researcher")      return <Navigate to="/app"    replace />;
  return <>{children}</>;
}

function AnyAuthRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function PublicProfileRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn())              return <Navigate to="/signin" replace />;
  const role = getRole();
  if (role !== "admin" && role !== "researcher") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root: redirect based on login status and role */}
        <Route path="/" element={
          !isLoggedIn()
            ? <Navigate to="/signin" replace />
            : getRole() === "admin"
              ? <Navigate to="/admin" replace />
              : <Navigate to="/app"   replace />
        } />

        {/* Public routes — no login required */}
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* User + Researcher routes */}
        <Route path="/app"
          element={<UserRoute><DashboardPage /></UserRoute>} />
        <Route path="/project/:id"
          element={<UserRoute><ProjectDataPage /></UserRoute>} />
        <Route path="/profile"
          element={<UserRoute><ProfilePage /></UserRoute>} />

        {/* Researcher only */}
        <Route path="/browse"
          element={<ResearcherRoute><ResearcherPage /></ResearcherRoute>} />

        {/* Researcher project view — read-only access to any project */}
        <Route path="/view-project/:id"
          element={<PublicProfileRoute><ProjectDataPage /></PublicProfileRoute>} />

        {/* Merged project view — accessible by all roles */}
        <Route path="/merged-project/:id"
          element={<AnyAuthRoute><MergedProjectPage /></AnyAuthRoute>} />

        {/* Admin + Researcher */}
        <Route path="/user/:username"
          element={<PublicProfileRoute><PublicProfilePage /></PublicProfileRoute>} />

        {/* Admin only */}
        <Route path="/admin"
          element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/project/:id"
          element={<AdminRoute><ProjectDataPage /></AdminRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}