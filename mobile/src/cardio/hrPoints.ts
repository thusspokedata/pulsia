import type { CardioSamples } from "@pulsia/shared";

export type HrPoint = { t: number; bpm: number };

// Fuente de la curva de FC de una actividad de cardio. Prioriza el stream columnar `samples`
// (más rico, la fuente hacia adelante desde la Fase 1 de captura total): recorre `samples.t`/`hr`
// en paralelo y descarta los huecos (canal disperso). Si no hay canal `hr` útil —sin samples,
// sin canal, o el canal vino todo en null (fila vieja que la migración 0021 no pudo backfillear
// del todo)— cae a `hrSeries`. Nunca mezcla ambas fuentes en la misma curva.
export function cardioHrPoints(a: { samples?: CardioSamples; hrSeries?: HrPoint[] }): HrPoint[] {
  const t = a.samples?.t;
  const hr = a.samples?.hr;
  if (t && hr) {
    const points: HrPoint[] = [];
    for (let i = 0; i < t.length; i++) {
      const bpm = hr[i];
      if (bpm != null) points.push({ t: t[i], bpm });
    }
    if (points.length > 0) return points;
  }
  return a.hrSeries ?? [];
}
