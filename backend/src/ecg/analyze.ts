import { eq } from "drizzle-orm";
import { ecgRecording, settings } from "../db/schema";
import { maybeDecryptPdf } from "./decryptPdf";
import { priorEcgFor } from "./repository";
import { buildEcgSummary } from "../ai/ecgSummary";
import { resolveAiKey } from "../ai/resolveKey";
import { decryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

// Floating promise: NUNCA throwea. Marca la fila done/failed.
export async function runEcgAnalysis(deps: AppDeps, recordingId: string, userId: string): Promise<void> {
  try {
    const row = await deps.db.query.ecgRecording.findFirst({ where: eq(ecgRecording.id, recordingId) });
    if (!row) return;
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const password = settingsRow?.kardiaPwEncrypted ? decryptSecret(settingsRow.kardiaPwEncrypted, deps.config.encryptionKey) : undefined;
    const decrypted = await maybeDecryptPdf(row.pdf as Buffer, password);
    const prior = await priorEcgFor(deps.db, userId);
    const historySummary = buildEcgSummary(prior);
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) throw new Error("No hay API key de IA disponible.");
    if (!deps.aiClient.interpretEcg) throw new Error("El cliente de IA no soporta interpretEcg.");
    const analysis = await deps.aiClient.interpretEcg({ pdfBase64: decrypted.toString("base64"), apiKey, historySummary });
    await deps.db.update(ecgRecording).set({
      status: "done", kardiaVerdict: analysis.kardiaVerdict, avgHr: analysis.avgHeartRate,
      recordedAt: analysis.recordedAt, interpretation: analysis.interpretation, error: null,
    }).where(eq(ecgRecording.id, recordingId));
  } catch (e) {
    await deps.db.update(ecgRecording).set({ status: "failed", error: (e as Error).message })
      .where(eq(ecgRecording.id, recordingId))
      .catch((err) => console.warn("no se pudo marcar el ECG como failed:", (err as Error).message));
  }
}
