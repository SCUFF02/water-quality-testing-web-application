import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../auth/auth";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await signUp({ email, password });
    nav("/signin", { replace: true });
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={submit}>
        <h2>Sign In</h2>

        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Create account</button>

        <p style={{ marginTop: 8 }}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}