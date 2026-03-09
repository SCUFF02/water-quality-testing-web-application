import { useNavigate } from "react-router-dom";
import { useState } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

export default function DashboardPage() {
  const nav = useNavigate();

  const [multiOpen, setMultiOpen] = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);

  function logout() {
    localStorage.removeItem("token");
    nav("/signin", { replace: true });
  }

  const username = "User";

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div className="logo">
          <img src="/certelogo.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>

        <div className="topbar-actions">
          <button
            className="profile-btn"
            type="button"
            onClick={() => nav("/profile")}
          >
            {username}
          </button>

          <button
            className="logout-btn"
            type="button"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <h2>What are you working on?</h2>

        <div className="systems">
          <button type="button" onClick={() => setMultiOpen(true)}>
            MultiSensor System
          </button>

          <button type="button" onClick={() => setDosingOpen(true)}>
            Dosing System
          </button>
        </div>
      </main>

      {multiOpen && <MultiSensorForm onClose={() => setMultiOpen(false)} />}
      {dosingOpen && <DosingSystemForm onClose={() => setDosingOpen(false)} />}
    </div>
  );
}