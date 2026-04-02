import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/api";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState<"user" | "researcher">("user");
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed)            { setError("Username is required."); return; }
    if (trimmed.length < 3)  { setError("Username must be at least 3 characters."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError("");

    try {
      const res  = await api.postPublic("/auth/register", { username: trimmed, email, password, role });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Registration failed.");
        return;
      }

      setSuccess(true);
      setTimeout(() => nav("/signin", { replace: true }), 1400);
    } catch {
      setError("Could not connect to server. Make sure the backend is running.");
    }
  }

  return (
    <div className="wave-auth-page">
      <div className="wave-form-panel">
        <div className="wave-form-inner">
          <h1 className="wave-form-title">Sign Up</h1>

          <div className="wave-role-selector">
            <button type="button" disabled={success}
              className={`wave-role-btn${role === "user" ? " active" : ""}`}
              onClick={() => setRole("user")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <div className="wave-role-name">Private User</div>
                <div className="wave-role-desc">Own projects only</div>
              </div>
            </button>
            <button type="button" disabled={success}
              className={`wave-role-btn wave-role-researcher${role === "researcher" ? " active" : ""}`}
              onClick={() => setRole("researcher")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <div>
                <div className="wave-role-name">Researcher</div>
                <div className="wave-role-desc">Browse all users</div>
              </div>
            </button>
          </div>

          <form onSubmit={submit} className="wave-form">
            <div className="wave-field">
              <label>Username</label>
              <input type="text" placeholder="e.g. sara_k" value={username} required disabled={success}
                onChange={(e) => { setUsername(e.target.value); setError(""); }} />
            </div>
            <div className="wave-field">
              <label>Email address</label>
              <input type="email" placeholder="yourname@email.com" value={email} required disabled={success}
                onChange={(e) => { setEmail(e.target.value); setError(""); }} />
            </div>
            <div className="wave-field">
              <label>Password</label>
              <input type="password" placeholder="Min. 6 characters" value={password} required disabled={success}
                onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            </div>

            {error   && <p className="wave-error">{error}</p>}
            {success && <p className="wave-success">Account created! Redirecting…</p>}

            <button type="submit" className="wave-btn" disabled={success}>
              {success ? <span className="wave-spinner" /> : "Create account"}
            </button>
          </form>

          <p className="wave-switch">
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="wave-illus-panel">
        <svg className="wave-divider" viewBox="0 0 120 800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M120,0 C60,200 0,300 60,500 C90,620 120,700 120,800 L0,800 L0,0 Z" fill="white"/>
        </svg>
        <div className="wave-illus-watermark">CERTE</div>
      </div>
    </div>
  );
}