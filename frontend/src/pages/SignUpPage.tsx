import { useState } from "react";
import { signUp } from "../auth/auth";

export default function SignUpPage() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");

  async function submit(e:any){
    e.preventDefault();
    await signUp({email,password});
  }

  return (
    <form onSubmit={submit}>
      <h2>Sign Up</h2>
      <input onChange={e=>setEmail(e.target.value)} />
      <input type="password" onChange={e=>setPassword(e.target.value)} />
      <button>Create account</button>
    </form>
  );
}