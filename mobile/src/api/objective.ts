import { apiFetch } from "./client";

export async function getObjective(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective");
  if (!res.ok) throw new Error("No se pudo cargar el objetivo");
  return ((await res.json()) as { content: string }).content;
}

export async function putObjective(baseUrl: string, content: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("No se pudo guardar el objetivo");
  return ((await res.json()) as { content: string }).content;
}

// El borrador dispara una llamada a la IA → timeout más generoso.
export async function draftObjective(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/objective/draft", { method: "POST", timeoutMs: 60000 });
  if (!res.ok) throw new Error("No se pudo sugerir el objetivo");
  return ((await res.json()) as { content: string }).content;
}
