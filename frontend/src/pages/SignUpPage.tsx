import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../auth/auth";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  function isUsernameTaken(name: string): boolean {
    const existing = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    return existing.some(
      (user: { username: string }) =>
        user.username.trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }

    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    if (isUsernameTaken(trimmedUsername)) {
      setError("This username is already taken. Please choose another.");
      return;
    }

    setError("");

    // Save user to localStorage
    const existing = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
    existing.push({ username: trimmedUsername, email, password });
    localStorage.setItem("registeredUsers", JSON.stringify(existing));

    await signUp({ email, password });
    nav("/signin", { replace: true });
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={submit}>
        <h2>Sign Up</h2>

        <input
          type="text"
          placeholder="Username"
          value={username}
          required
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit">Create account</button>

        <p style={{ marginTop: 8 }}>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </form>
    </div>
  );
}