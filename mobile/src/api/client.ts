// `timeoutMs` aborta el request si el backend no responde (default 15s para llamadas rápidas;
// la generación de programa pasa un timeout largo).
export async function apiFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const { timeoutMs = 15000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}
