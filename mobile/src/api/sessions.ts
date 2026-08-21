import { apiFetch } from "./client";
import type { WorkoutSession } from "@pulsia/shared";
import { syncErrorFromResponse, syncErrorFromThrown } from "../sync/errors";

// Sube una sesión completa (upsert idempotente en el backend). El id de la sesión
// es la identidad canónica del sync. Tira SyncError (tipado) ante cualquier fallo.
export async function putSession(baseUrl: string, session: WorkoutSession): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch(baseUrl, `/sessions/${session.id}`, {
      method: "PUT",
      body: JSON.stringify(session),
    });
  } catch (e) {
    throw syncErrorFromThrown(e);
  }
  if (!res.ok) throw syncErrorFromResponse(res);
}

// Ítem liviano del historial: el backend GET /sessions devuelve una proyección
// SIN los ejercicios (no sirve para summarize; para eso está getSessionById).
// programId/dayLabel son nullable: un entrenamiento importado del .FIT no cuelga de un programa.
export interface SessionListItem {
  id: string;
  programId: string | null;
  dayLabel: string | null;
  location: "gym" | "home";
  startedAt: number;
  totalDurationMs: number | null;
  completionPct: number;
  avgHr: number | null;
}

// El preview de un .FIT de fuerza (POST /sessions/from-fit/preview). El catalogId ya viene resuelto
// por el backend (que tiene el SDK + el catálogo).
export interface FitStrengthSetView { reps: number | null; weightKg: number | null; durationMs: number }
export interface FitStrengthExerciseView {
  category: string;
  exerciseNameIndex: number | null;
  displayName: string | null;
  catalogId: string;
  sets: FitStrengthSetView[];
}
export interface FitStrengthPreviewView {
  workoutName: string | null;
  exercises: FitStrengthExerciseView[];
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;
}

// Pide el preview de fuerza. Devuelve null si el .FIT NO es de fuerza (422) — el llamador cae al
// flujo de cardio. Lanza en cualquier otro error (archivo ilegible, red).
export async function previewFitStrength(baseUrl: string, fitBase64: string): Promise<FitStrengthPreviewView | null> {
  const res = await apiFetch(baseUrl, "/sessions/from-fit/preview", { method: "POST", body: JSON.stringify({ fitBase64 }) });
  if (res.status === 422) return null; // no es fuerza → el llamador prueba cardio
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo leer el archivo .FIT");
  }
  return (await res.json()) as FitStrengthPreviewView;
}

// Persiste un .FIT de fuerza como entrenamiento (POST /sessions/from-fit). Idempotente por id.
export async function importFitStrength(
  baseUrl: string,
  args: { fitBase64: string; id: string; location: "gym" | "home" },
): Promise<void> {
  const res = await apiFetch(baseUrl, "/sessions/from-fit", { method: "POST", body: JSON.stringify(args) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo importar el entrenamiento");
  }
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
