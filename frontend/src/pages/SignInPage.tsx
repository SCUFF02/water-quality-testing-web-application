import { useState } from "react";
import { signIn } from "../auth/auth";
import { useNavigate } from "react-router-dom";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();

  async function submit(e:any) {
    e.preventDefault();
    const res = await signIn({ email, password });
    localStorage.setItem("token", res.access_token);
    nav("/app");
  }

  return (
    <form onSubmit={submit}>
      <h2>Sign In</h2>
      <input placeholder="email" onChange={e=>setEmail(e.target.value)} />
      <input type="password" placeholder="password"
        onChange={e=>setPassword(e.target.value)} />
      <button>Login</button>
    </form>
  );
}