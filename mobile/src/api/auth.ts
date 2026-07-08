import { apiFetch } from "./client";
import { setToken, clearToken } from "../storage/authToken";

async function tokenFrom(res: Response): Promise<string> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body?.error === "string" ? body.error : "Error de autenticación");
  }
  const data = await res.json();
  if (!data?.token) throw new Error("Respuesta inválida del servidor");
  return data.token;
}

export async function login(baseUrl: string, email: string, password: string): Promise<void> {
  const res = await apiFetch(baseUrl, "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  await setToken(await tokenFrom(res));
}

export async function register(baseUrl: string, email: string, password: string, inviteCode: string): Promise<void> {
  const res = await apiFetch(baseUrl, "/auth/register", { method: "POST", body: JSON.stringify({ email, password, inviteCode }) });
  await setToken(await tokenFrom(res));
}

export async function logout(baseUrl: string): Promise<void> {
  try { await apiFetch(baseUrl, "/auth/logout", { method: "POST" }); } catch { /* best-effort */ }
  await clearToken();
}
