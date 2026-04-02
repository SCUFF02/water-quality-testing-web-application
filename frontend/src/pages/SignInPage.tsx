import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/api";

export default function SignInPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res  = await api.postPublic("/auth/login", { email, password });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Invalid email or password.");
        return;
      }

      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("currentUser", JSON.stringify({
        username: payload.username,
        role:     payload.role,
      }));

      if (payload.role === "admin") nav("/admin", { replace: true });
      else nav("/app", { replace: true });

    } catch {
      setError("Could not connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wave-auth-page">
      <div className="wave-form-panel">
        <div className="wave-form-inner">
          <h1 className="wave-form-title">Login</h1>

          <form onSubmit={submit} className="wave-form">
            <div className="wave-field">
              <label>Email address</label>
              <input type="email" placeholder="yourname@email.com" value={email} required
                onChange={(e) => { setEmail(e.target.value); setError(""); }} />
            </div>
            <div className="wave-field">
              <label>Password</label>
              <input type="password" placeholder="••••••••••" value={password} required
                onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            </div>

            {error && <p className="wave-error">{error}</p>}

            <button type="submit" className="wave-btn" disabled={loading}>
              {loading ? <span className="wave-spinner" /> : "Login"}
            </button>
          </form>

          <p className="wave-switch">
            Don't have an account? <Link to="/signup">Sign up</Link>
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