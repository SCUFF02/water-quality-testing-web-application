import { http } from "../api/http";

export async function signUp(data: any) {
  const res = await http.post("/auth/signup", data);
  return res.data;
}

export async function signIn(data: any) {
  const res = await http.post("/auth/login", data);
  return res.data;
}

export function isAuthed() {
  return !!localStorage.getItem("token");
}