import { apiFetch } from "./client";

// Carga la memoria actual del atleta desde el backend.
export async function getMemory(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/memory");
  if (!res.ok) throw new Error("No se pudo cargar la memoria");
  return ((await res.json()) as { content: string }).content;
}

// Regenera la memoria del atleta invocando la IA en el backend.
// El refresh dispara una llamada costosa a la IA → timeout más generoso (60s).
export async function refreshMemory(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/memory/refresh", { method: "POST", timeoutMs: 60000 });
  if (!res.ok) throw new Error("No se pudo actualizar la memoria");
  return ((await res.json()) as { content: string }).content;
}
