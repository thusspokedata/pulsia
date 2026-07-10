// mobile/src/session/hrSeries.ts

// Construye la curva de FC de toda la sesión: bucketiza samples (timestamps epoch-ms
// absolutos) en ventanas de `intervalMs` alineadas a `startedAt`, y emite un punto por
// bucket no vacío con el PROMEDIO redondeado de bpm de ese bucket (no el último sample):
// un promedio resume mejor una ventana de 5s que una sola lectura puntual, que puede caer
// en un pico/valle transitorio y no representar la ventana completa.
export function buildHrSeries(
  samples: { t: number; bpm: number }[],
  startedAt: number,
  intervalMs = 5000,
): { t: number; bpm: number }[] {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const s of samples) {
    if (s.t < startedAt) continue; // fuera de la sesión: no debe crear un bucket negativo
    const bucketIndex = Math.floor((s.t - startedAt) / intervalMs);
    const bucket = buckets.get(bucketIndex) ?? { sum: 0, count: 0 };
    bucket.sum += s.bpm;
    bucket.count += 1;
    buckets.set(bucketIndex, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketIndex, { sum, count }]) => ({
      t: bucketIndex * intervalMs,
      bpm: Math.round(sum / count),
    }));
}
