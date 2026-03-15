import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignInPage        from "../pages/SignInPage";
import SignUpPage        from "../pages/SignUpPage";
import DashboardPage     from "../pages/DashboardPage";
import ProjectDataPage   from "../pages/ProjectDataPage";
import ProfilePage       from "../pages/ProfilePage";
import AdminPage         from "../pages/AdminPage";
import ResearcherPage    from "../pages/ResearcherPage";
import PublicProfilePage from "../pages/PublicProfilePage";

// ── Seed default admin ───────────────────────────────────────────────────────
function seedAdmin() {
  const users = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
  if (!users.some((u: { role: string }) => u.role === "admin")) {
    users.push({ username: "admin", email: "admin@certe.tn", password: "Admin1234!", role: "admin" });
    localStorage.setItem("registeredUsers", JSON.stringify(users));
  }
}
seedAdmin();
// ────────────────────────────────────────────────────────────────────────────

function getRole(): string {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}").role || ""; }
  catch { return ""; }
}

// Regular users + researchers only — blocks admins
function UserRoute({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem("token")) return <Navigate to="/signin" replace />;
  if (getRole() === "admin")          return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

// Admin only
function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem("token")) return <Navigate to="/signin" replace />;
  if (getRole() !== "admin")          return <Navigate to="/app" replace />;
  return <>{children}</>;
}

// Researchers only — blocks plain users AND admins
function ResearcherRoute({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem("token")) return <Navigate to="/signin" replace />;
  const role = getRole();
  if (role === "admin")                               return <Navigate to="/admin" replace />;
  if (role !== "researcher")                          return <Navigate to="/app" replace />;
  return <>{children}</>;
}

// Admin + researcher — for /user/:username (admin can view public profiles)
function PublicProfileRoute({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem("token")) return <Navigate to="/signin" replace />;
  const role = getRole();
  if (role !== "admin" && role !== "researcher")      return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root redirects based on role */}
        <Route path="/" element={
          !localStorage.getItem("token")
            ? <Navigate to="/signin" replace />
            : getRole() === "admin"
              ? <Navigate to="/admin" replace />
              : <Navigate to="/app" replace />
        } />

        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* User + Researcher routes — admin is blocked from these */}
        <Route path="/app"
          element={<UserRoute><DashboardPage /></UserRoute>} />
        <Route path="/project/:projectName"
          element={<UserRoute><ProjectDataPage /></UserRoute>} />
        <Route path="/profile"
          element={<UserRoute><ProfilePage /></UserRoute>} />

        {/* Researcher-only */}
        <Route path="/browse"
          element={<ResearcherRoute><ResearcherPage /></ResearcherRoute>} />

        {/* Admin + researcher — view other users' public profiles */}
        <Route path="/user/:username"
          element={<PublicProfileRoute><PublicProfilePage /></PublicProfileRoute>} />

        {/* Admin only */}
        <Route path="/admin"
          element={<AdminRoute><AdminPage /></AdminRoute>} />

        {/* Admin project view */}
        <Route path="/admin/project/:projectName"
          element={<AdminRoute><ProjectDataPage /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}