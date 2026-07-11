import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { AiClient } from "../ai/client";
import { getMemory, upsertMemory } from "./repository";
import { getRecentSessions, getSessionsSince } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { buildProgressSummary, PROGRESS_WINDOW_MS } from "../ai/progress";
import { getMetricsSince } from "../metrics/repository";
import { profiles } from "../db/schema";

// Actualiza la memoria del atleta desde las últimas 6 sesiones y la persiste. Devuelve la nueva memoria.
// Lanza si el AiClient no soporta updateMemory o si la llamada a la IA falla.
// `opts` permite reusar valores ya computados por el caller (evita re-fetchear en /generate,
// que ya tiene la memoria previa y el historySummary a mano).
export async function refreshAthleteMemory(
  db: Db,
  ai: AiClient,
  userId: string,
  apiKey: string,
  model: string,
  opts?: { current?: string; historySummary?: string; progressSummary?: string },
): Promise<string> {
  if (!ai.updateMemory) throw new Error("Actualización de memoria no disponible.");
  const current = opts?.current ?? (await getMemory(db, userId));
  // Las sesiones recientes solo se traen si algún resumen falta en `opts` (el caller de /generate ya
  // pasa ambos → evita la query con joins en el refresh de background). Memoizado para no repetirla.
  let recentCache: Awaited<ReturnType<typeof getRecentSessions>> | undefined;
  const getRecent = async () => (recentCache ??= await getRecentSessions(db, userId, 6));
  const historySummary = opts?.historySummary ?? buildTrainingHistorySummary(await getRecent());
  let progressSummary = opts?.progressSummary;
  if (progressSummary == null) {
    const since = Date.now() - PROGRESS_WINDOW_MS;
    // Ventana por fecha, no las últimas 6 sesiones (getRecent): con entrenos frecuentes, 6 sesiones
    // pueden cubrir mucho menos que la ventana de progreso y subestimar la tendencia.
    const [metrics, sessionsForProgress] = await Promise.all([
      getMetricsSince(db, userId, since),
      getSessionsSince(db, userId, since),
    ]);
    // No hay repo de perfil: se lee inline (mismo patrón que routes/profile.ts).
    const profileRow = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    const heightCm = profileRow?.data?.heightCm ?? null;
    progressSummary = buildProgressSummary({ metrics, sessions: sessionsForProgress, heightCm, nowMs: Date.now(), profileWeightKg: profileRow?.data?.weightKg ?? null });
  }
  const updated = await ai.updateMemory({ current, historySummary, progressSummary, apiKey, model });
  await upsertMemory(db, userId, updated);
  return updated;
}
