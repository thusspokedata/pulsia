import { eq } from "drizzle-orm";
import type { TrainingProfile } from "@pulsia/shared";
import { programs, generationJobs } from "../db/schema";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import { generateProgramForProfile } from "../ai/generate";
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
    const program = await generateProgramForProfile({ profile, apiKey, model, ai: deps.aiClient, historySummary, memory });
    const inserted = await deps.db
      .insert(programs)
      .values({ userId, name: program.name, data: program, profileSnapshot: profile })
      .returning();
    await deps.db.update(generationJobs).set({ status: "done", programId: inserted[0].id }).where(eq(generationJobs.id, jobId));
    // Refresh de memoria en background para las próximas generaciones (best-effort).
    void refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, { current: memory, historySummary })
      .catch((e) => console.warn("refresh de memoria (bg) falló:", (e as Error).message));
  } catch (e) {
    await deps.db
      .update(generationJobs)
      .set({ status: "error", error: (e as Error).message })
      .where(eq(generationJobs.id, jobId))
      .catch((err) => console.warn("no se pudo marcar el job como error:", (err as Error).message));
  }
}
