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
