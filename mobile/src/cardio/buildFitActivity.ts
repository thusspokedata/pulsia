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
  };
}
