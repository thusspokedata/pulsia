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

// Ítem liviano del historial: el backend GET /sessions devuelve una proyección
// SIN los ejercicios (no sirve para summarize; para eso está getSessionById).
export interface SessionListItem {
  id: string;
  programId: string;
  dayLabel: string;
  location: "gym" | "home";
  startedAt: number;
  totalDurationMs: number | null;
  completionPct: number;
  avgHr: number | null;
}

// Trae el historial (liviano) de sesiones del usuario desde el backend.
export async function getSessions(baseUrl: string): Promise<SessionListItem[]> {
  const res = await apiFetch(baseUrl, "/sessions");
  if (!res.ok) throw new Error("No se pudieron cargar las sesiones");
  return (await res.json()) as SessionListItem[];
}

// Trae UNA sesión completa (con ejercicios y series) por id, para el resumen.
export async function getSessionById(baseUrl: string, id: string): Promise<WorkoutSession> {
  const res = await apiFetch(baseUrl, `/sessions/${id}`);
  if (!res.ok) throw new Error("No se pudo cargar la sesión");
  return (await res.json()) as WorkoutSession;
}

// Elimina una sesión del backend (cascade borra ejercicios y series).
export async function deleteSessionById(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo eliminar el entrenamiento");
}

// Trae el último peso usado por ejercicio (catalogId -> kg), para sugerir en la sesión.
export async function getLastWeights(baseUrl: string): Promise<Record<string, number>> {
  const res = await apiFetch(baseUrl, "/sessions/last-weights");
  if (!res.ok) throw new Error("No se pudieron cargar los pesos sugeridos");
  return (await res.json()) as Record<string, number>;
}
