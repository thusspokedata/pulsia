export async function apiFetch(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
