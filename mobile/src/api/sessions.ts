import { apiFetch } from "./client";
import type { WorkoutSession } from "@pulsia/shared";

// Sube una sesión completa (upsert idempotente en el backend). El id de la sesión
// es la identidad canónica del sync.
export async function putSession(baseUrl: string, session: WorkoutSession): Promise<void> {
  const res = await apiFetch(baseUrl, `/sessions/${session.id}`, {
    method: "PUT",
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error("No se pudo sincronizar la sesión");
}
