import { eq } from "drizzle-orm";
import type { TrainingProfile } from "@pulsia/shared";
import { programs, generationJobs, settings } from "../db/schema";
import { getRecentSessions, getSessionsSince } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import { generateProgramForProfile } from "../ai/generate";
import { buildProgressSummary, PROGRESS_WINDOW_MS } from "../ai/progress";
import { getMetricsSince } from "../metrics/repository";
import { priorEcgFor } from "../ecg/repository";
import { buildEcgSummary } from "../ai/ecgSummary";
import type { AppDeps } from "../app";

// Corre la generación (una llamada a la IA), guarda el programa y actualiza el job.
// Pensado para correr en background (floating promise): NUNCA throwea (captura todo y marca el job).
export async function runGenerationJob(
  deps: AppDeps,
  jobId: string,
  userId: string,
  profile: TrainingProfile,
  apiKey: string,
  model: string,
): Promise<void> {
  try {
    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);
    const memory = await getMemory(deps.db, userId);
    const since = Date.now() - PROGRESS_WINDOW_MS;
    const [metrics, sessionsForProgress] = await Promise.all([
      getMetricsSince(deps.db, userId, since),
      getSessionsSince(deps.db, userId, since),
    ]);
    const progressSummary = buildProgressSummary({ metrics, sessions: sessionsForProgress, heightCm: profile.heightCm ?? null, nowMs: Date.now(), profileWeightKg: profile.weightKg ?? null });
    // Contexto ECG (Kardia) sólo si el usuario lo habilitó en Configuración; si no hay registros, queda undefined.
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    let ecgSummary: string | undefined;
    if (settingsRow?.ecgEnabled) {
      const recordings = await priorEcgFor(deps.db, userId);
      ecgSummary = buildEcgSummary(recordings) || undefined;
    }
    const program = await generateProgramForProfile({ profile, apiKey, model, ai: deps.aiClient, historySummary, memory, progressSummary, ecgSummary });
    const inserted = await deps.db
      .insert(programs)
      .values({ userId, name: program.name, data: program, profileSnapshot: profile })
      .returning();
    await deps.db.update(generationJobs).set({ status: "done", programId: inserted[0].id }).where(eq(generationJobs.id, jobId));
    // Refresh de memoria en background para las próximas generaciones (best-effort).
    void refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, { current: memory, historySummary, progressSummary })
      .catch((e) => console.warn("refresh de memoria (bg) falló:", (e as Error).message));
  } catch (e) {
    await deps.db
      .update(generationJobs)
      .set({ status: "error", error: (e as Error).message })
      .where(eq(generationJobs.id, jobId))
      .catch((err) => console.warn("no se pudo marcar el job como error:", (err as Error).message));
  }
}
