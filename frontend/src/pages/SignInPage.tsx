import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const users = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    const match = users.find(
      (u: { email: string; password: string }) =>
        u.email === email && u.password === password
    );

    if (!match) {
      setError("Invalid email or password.");
      return;
    }

    localStorage.setItem("token", "authenticated");
    localStorage.setItem(
      "currentUser",
      JSON.stringify({ username: match.username, role: match.role || "user" })
    );

    if (match.role === "admin") {
      nav("/admin", { replace: true });
    } else {
      nav("/app", { replace: true });
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={submit}>
        <h2>Sign In</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          required
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          required
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit">Sign in</button>

        <p style={{ marginTop: 8 }}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
