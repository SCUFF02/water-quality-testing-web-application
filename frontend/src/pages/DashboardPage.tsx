import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const nav = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    nav("/signin");
  }

  const username = "User"; // later load from API

  return (
    <div className="dashboard-page">
      
      {/* Top navigation bar */}
      <header className="topbar">
        <div className="logo">
          <strong>CERTE</strong>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="profile-btn"
            onClick={() => nav("/profile")}
          >
            {username}
          </button>

          <button
            className="logout-btn"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="dashboard-content">
        <h2>What are you working on?</h2>

        <div className="systems">
          <button
            onClick={() => nav("/multisensor")}
          >
            MultiSensor System
          </button>

          <button
            onClick={() => nav("/dosing")}
          >
            Dosing System
          </button>
        </div>
      </main>

    </div>
  );
}