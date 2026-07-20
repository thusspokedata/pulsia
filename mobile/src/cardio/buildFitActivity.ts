import type { CardioActivity, CardioFitPreview, CardioType } from "@pulsia/shared";

export interface FitFormFields {
  type: CardioType;
  durationMs: number;
  distanceM: number | null;
  avgHr: number | null;
  notes: string;
}

// Arma la CardioActivity a confirmar desde un preview de .FIT. Los campos que el reloj mide y el
// usuario no toca (startedAt, kcal, maxHr, elevación, hrSeries) salen del preview; el resto del form.
// `kcalSource` se setea igual que lo deriva el server (kcal + source fit → device); el server lo
// re-deriva de todos modos, esto es solo optimista para el estado local.
//
// ⚠️ TODO lo que el parser extrae tiene que viajar de acá al POST: el server persiste lo que el
// cliente manda, así que un campo olvidado en esta función se guarda como NULL para siempre, aunque
// el backend lo haya parseado perfecto. Pasó: la Fase 1 capturaba samples/fitExtras/escalares y esta
// función los descartaba en silencio, con todos los tests en verde porque cada pieza andaba por
// separado. Si agregás un campo al preview, agregalo también acá.
export function buildFitActivity(preview: CardioFitPreview, form: FitFormFields, id: string): CardioActivity {
  return {
    id,
    type: form.type,
    startedAt: preview.startedAt,
    durationMs: form.durationMs,
    distanceM: form.distanceM,
    avgHr: form.avgHr,
    maxHr: preview.maxHr,
    elevationGainM: preview.elevationGainM,
    kcal: preview.kcal,
    kcalSource: preview.kcal != null ? "device" : "estimate",
    source: "fit",
    hrSeries: preview.hrSeries,
    notes: form.notes,
    // Captura total del .FIT (Fase 1): escalares de sesión + stream multicanal + extras.
    totalCycles: preview.totalCycles,
    trainingLoad: preview.trainingLoad,
    trainingEffectAerobic: preview.trainingEffectAerobic,
    trainingEffectAnaerobic: preview.trainingEffectAnaerobic,
    avgCadence: preview.avgCadence,
    maxCadence: preview.maxCadence,
    avgFractionalCadence: preview.avgFractionalCadence,
    avgRespiration: preview.avgRespiration,
    maxRespiration: preview.maxRespiration,
    minRespiration: preview.minRespiration,
    metabolicKcal: preview.metabolicKcal,
    sportProfileName: preview.sportProfileName,
    tzOffsetMinutes: preview.tzOffsetMinutes,
    samples: preview.samples,
    fitExtras: preview.fitExtras,
  };
}
