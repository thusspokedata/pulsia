export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  onUnauthorized?: () => void;
  signal?: AbortSignal;
}

// Same-origin en prod (el mismo Hono sirve la SPA) y en dev (proxy de Vite). La cookie httpOnly
// viaja sola con `credentials: "same-origin"`. Las mutaciones llevan X-Requested-With para el
// chequeo anti-CSRF del backend.
export async function apiFetch<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (method !== "GET") headers["X-Requested-With"] = "fetch";

  const res = await fetch(path, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    opts.onUnauthorized?.();
    throw new ApiError(401, (data as any)?.error ?? "No autorizado");
  }
  if (!res.ok) {
    const msg = (data as any)?.error;
    throw new ApiError(res.status, typeof msg === "string" ? msg : `Error ${res.status}`);
  }
  return data as T;
}
