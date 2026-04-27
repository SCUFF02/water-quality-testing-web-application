import { useEffect, useState } from "react";
import AppRouter from "./routes/AppRouter";

function getTokenExpiry(): number | null {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000;
  } catch { return null; }
}

export default function App() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const expiry = getTokenExpiry();
      if (!expiry) { setSecondsLeft(null); return; }
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      if (remaining <= 0) {
        localStorage.removeItem("token");
        localStorage.removeItem("currentUser");
        window.location.href = "/signin";
        return;
      }
      // Show warning in last 5 minutes
      setSecondsLeft(remaining <= 300 ? remaining : null);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0;
  const secs = secondsLeft != null ? String(secondsLeft % 60).padStart(2, "0") : "00";

  return (
    <>
      {secondsLeft != null && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "#f59e0b", color: "#fff", padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          fontSize: 14, fontWeight: 500, boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Session expires in {mins}:{secs} — please save your work.
          <button onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("currentUser");
            window.location.href = "/signin";
          }} style={{
            background: "#fff", color: "#f59e0b", border: "none",
            borderRadius: 6, padding: "4px 12px", fontWeight: 600, cursor: "pointer", fontSize: 13
          }}>Re-login now</button>
        </div>
      )}
      <AppRouter />
    </>
  );
}
