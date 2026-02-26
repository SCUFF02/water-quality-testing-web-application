import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import SignInPage from "../pages/SignInPage";
import SignUpPage from "../pages/SignUpPage";
import DashboardPage from "../pages/DashboardPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* redirection page initiale */}
        <Route path="/" element={<Navigate to="/app" replace />} />

        {/* pages publiques */}
        <Route path="/SignIn" element={<SignInPage />} />
        <Route path="/SignUp" element={<SignUpPage />} />

        {/* pages protégées */}
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<DashboardPage />} />
        </Route>

        {/* fallback si route inconnue */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}