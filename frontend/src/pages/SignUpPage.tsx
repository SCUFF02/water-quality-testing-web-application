import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState<"user" | "researcher">("user");
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);
  const nav = useNavigate();

  function isUsernameTaken(name: string): boolean {
    const existing = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    return existing.some(
      (u: { username: string }) =>
        u.username.trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  function isEmailTaken(emailValue: string): boolean {
    const existing = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    return existing.some(
      (u: { email: string }) =>
        u.email.trim().toLowerCase() === emailValue.trim().toLowerCase()
    );
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed)              { setError("Username is required."); return; }
    if (trimmed.length < 3)    { setError("Username must be at least 3 characters."); return; }
    if (isUsernameTaken(trimmed)) { setError("This username is already taken."); return; }
    if (isEmailTaken(email))   { setError("An account with this email already exists."); return; }
    if (password.length < 6)   { setError("Password must be at least 6 characters."); return; }

    setError("");
    const existing = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    existing.push({ username: trimmed, email, password, role });
    localStorage.setItem("registeredUsers", JSON.stringify(existing));

    setSuccess(true);
    setTimeout(() => nav("/signin", { replace: true }), 1200);
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={submit}>
        <h2>Sign Up</h2>

        {/* Role selector */}
        <div className="role-selector">
          <button
            type="button"
            className={`role-option${role === "user" ? " active" : ""}`}
            onClick={() => setRole("user")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span className="role-option-title">Private User</span>
            <span className="role-option-desc">Only see your own projects</span>
          </button>
          <button
            type="button"
            className={`role-option${role === "researcher" ? " active researcher-active" : ""}`}
            onClick={() => setRole("researcher")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span className="role-option-title">Researcher</span>
            <span className="role-option-desc">Search & view other users' work</span>
          </button>
        </div>

        <label htmlFor="username">Username</label>
        <input id="username" type="text" placeholder="e.g. sara_k" value={username} required disabled={success}
          onChange={(e) => { setUsername(e.target.value); setError(""); }} />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" placeholder="you@example.com" value={email} required disabled={success}
          onChange={(e) => { setEmail(e.target.value); setError(""); }} />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="Min. 6 characters" value={password} required disabled={success}
          onChange={(e) => { setPassword(e.target.value); setError(""); }} />

        {error   && <p className="form-error">{error}</p>}
        {success && <p className="form-success">Account created! Redirecting to sign in…</p>}

        <button type="submit" disabled={success}>
          {success ? "Redirecting…" : "Create account"}
        </button>

        <p style={{ marginTop: 8 }}>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
