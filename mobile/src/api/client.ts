import { getToken, clearToken } from "../storage/authToken";
import { notifyUnauthorized } from "../auth/unauthorized";

// `timeoutMs` aborta el request si el backend no responde (default 15s para llamadas rápidas;
// la generación de programa pasa un timeout largo).
export async function apiFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const { timeoutMs = 15000, ...rest } = init ?? {};
  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.headers ?? {}),
      },
    });
    // Token vencido en una request autenticada: limpiar y avisar al guard (que vuelve al login).
    // Se excluyen las rutas de /auth/ (un 401 ahí es "credenciales inválidas", no sesión vencida).
    if (res.status === 401 && !path.startsWith("/auth/")) {
      await clearToken();
      notifyUnauthorized();
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Traduce una respuesta de error del backend a un mensaje legible (o el fallback si no viene JSON).
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch { /* no-JSON */ }
  return `${fallback} (error ${res.status})`;
}
