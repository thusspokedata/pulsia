import type { Db } from "../db/client";
import type { AiClient } from "../ai/client";
import { getMemory, upsertMemory } from "./repository";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";

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
  opts?: { current?: string; historySummary?: string },
): Promise<string> {
  if (!ai.updateMemory) throw new Error("Actualización de memoria no disponible.");
  const current = opts?.current ?? (await getMemory(db, userId));
  const historySummary =
    opts?.historySummary ?? buildTrainingHistorySummary(await getRecentSessions(db, userId, 6));
  const updated = await ai.updateMemory({ current, historySummary, apiKey, model });
  await upsertMemory(db, userId, updated);
  return updated;
}
