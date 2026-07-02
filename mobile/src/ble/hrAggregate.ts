// mobile/src/ble/hrAggregate.ts
export interface HrSample {
  t: number; // epoch ms de la lectura
  bpm: number;
}

// Agregados por serie (best-effort): promedio redondeado y pico.
// Sin samples → null/null (banda ausente o caída durante toda la serie).
export function aggregateHr(samples: HrSample[]): { hrAvg: number | null; hrMax: number | null } {
  if (samples.length === 0) return { hrAvg: null, hrMax: null };
  let sum = 0;
  let max = 0;
  for (const s of samples) {
    sum += s.bpm;
    if (s.bpm > max) max = s.bpm;
  }
  return { hrAvg: Math.round(sum / samples.length), hrMax: max };
}
