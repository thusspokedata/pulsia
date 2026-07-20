import type { Db } from "../db/client";
import { parseFit } from "./parseFit";
import { getCardioFitFileBytes, updateCardioFromFit } from "./repository";

export type ReprocessResult =
  | { status: "ok" }
  | { status: "no-file" }
  | { status: "parse-error"; message: string };

// Rellena los datos ricos de una actividad releyendo el .FIT que ya está guardado. Existe porque
// el archivo crudo se persiste (Fase 1): lo que hoy no sabemos leer se puede extraer después sin
// pedirle al usuario que reimporte nada.
// NUNCA toca lo que el usuario pudo editar a mano (ver FitDerived en repository.ts).
export async function reprocessActivity(db: Db, id: string, userId: string): Promise<ReprocessResult> {
  const bytes = await getCardioFitFileBytes(db, id, userId);
  if (!bytes) return { status: "no-file" };
  let preview;
  try {
    preview = parseFit(bytes);
  } catch (e) {
    // El archivo guardado ya no parsea (corrupto, o un cambio del parser): la actividad queda
    // INTACTA. Un reproceso fallido nunca debe empeorar lo que ya había.
    return { status: "parse-error", message: (e as Error).message || "no se pudo leer el .FIT guardado" };
  }
  await updateCardioFromFit(db, id, userId, {
    maxHr: preview.maxHr, elevationGainM: preview.elevationGainM, kcal: preview.kcal,
    totalCycles: preview.totalCycles, trainingLoad: preview.trainingLoad,
    trainingEffectAerobic: preview.trainingEffectAerobic,
    trainingEffectAnaerobic: preview.trainingEffectAnaerobic,
    avgCadence: preview.avgCadence, maxCadence: preview.maxCadence,
    avgFractionalCadence: preview.avgFractionalCadence,
    avgRespiration: preview.avgRespiration, maxRespiration: preview.maxRespiration,
    minRespiration: preview.minRespiration, metabolicKcal: preview.metabolicKcal,
    sportProfileName: preview.sportProfileName, fitExtras: preview.fitExtras,
    tzOffsetMinutes: preview.tzOffsetMinutes, samples: preview.samples,
  });
  return { status: "ok" };
}
