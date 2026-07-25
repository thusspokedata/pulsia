// FC extraída de los recordMesgs de un .FIT, en epoch ms ABSOLUTO. Compartido por el parser de
// cardio (hrSeries relativa) y por el import de fuerza (FC por serie con timestamps absolutos +
// hrSeries de la sesión). Vivir en un solo lugar evita que las dos extracciones diverjan.
export interface HrSample { tMs: number; bpm: number }

export function extractHrSamples(messages: any): HrSample[] {
  const records = (messages.recordMesgs ?? []) as Array<Record<string, unknown>>;
  return records
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date)
    .map((r) => ({ tMs: (r.timestamp as Date).getTime(), bpm: Math.round(r.heartRate as number) }));
}

// FC media/máx de las series: promedio y máximo de los samples cuyo timestamp cae en [start,end].
export function hrForInterval(samples: HrSample[], start: number, end: number): { avg: number | null; max: number | null } {
  const bpms = samples.filter((s) => s.tMs >= start && s.tMs <= end).map((s) => s.bpm);
  if (bpms.length === 0) return { avg: null, max: null };
  return { avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length), max: Math.max(...bpms) };
}

// Curva de FC de la sesión: t relativo al inicio, en buckets de `bucketMs` (promedio por bucket).
// Misma resolución que las sesiones de la app; evita inflar el jsonb con un punto por segundo.
export function downsampleHrSeries(samples: HrSample[], sessionStartedAt: number, bucketMs = 5000): { t: number; bpm: number }[] {
  const byBucket = new Map<number, { sum: number; n: number }>();
  for (const s of samples) {
    const t = s.tMs - sessionStartedAt;
    if (t < 0) continue;
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const acc = byBucket.get(bucket) ?? { sum: 0, n: 0 };
    acc.sum += s.bpm;
    acc.n += 1;
    byBucket.set(bucket, acc);
  }
  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([t, { sum, n }]) => ({ t, bpm: Math.round(sum / n) }));
}
