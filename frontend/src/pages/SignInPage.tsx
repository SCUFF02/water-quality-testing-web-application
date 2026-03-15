import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function SignInPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const nav = useNavigate();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const users = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
      const match = users.find(
        (u: { email: string; password: string }) =>
          u.email === email && u.password === password
      );
      if (!match) { setError("Invalid email or password."); setLoading(false); return; }
      localStorage.setItem("token", "authenticated");
      localStorage.setItem("currentUser", JSON.stringify({ username: match.username, role: match.role || "user" }));
      if (match.role === "admin") nav("/admin", { replace: true });
      else nav("/app", { replace: true });
    }, 400);
  }

  return (
    <div className="wave-auth-page">

      {/* ── LEFT: form panel ── */}
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

      {/* ── RIGHT: illustrated panel ── */}
      <div className="wave-illus-panel">
        {/* Wave divider SVG — left edge of illustrated panel */}
        <svg className="wave-divider" viewBox="0 0 120 800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M120,0 C60,200 0,300 60,500 C90,620 120,700 120,800 L0,800 L0,0 Z"
            fill="white"/>
        </svg>

        {/* Logo top-left */}
        <div className="wave-illus-watermark">CERTE</div>


      </div>
    </div>
  );
}