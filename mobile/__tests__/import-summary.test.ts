import { summarize } from "../src/session/summary";
import type { WorkoutSession } from "@pulsia/shared";

// Un WorkoutSession con la MISMA forma que produce fitStrengthToSession para un import de fuerza:
// programId/weekNumber nullable, series con endedAt = startedAt + durationMs, hrAvg/hrMax por serie,
// hrSeries de la sesión. Esta es "la costura": garantiza que el resumen se ve LLENO con esta forma,
// no solo que las piezas del backend andan por separado.
const imported: WorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  programId: null, weekNumber: null, dayLabel: "Push A", location: "home",
  startedAt: 1000, endedAt: 1000 + 120000, totalDurationMs: 120000, notes: "",
  hrSeries: [{ t: 0, bpm: 100 }, { t: 5000, bpm: 120 }],
  exercises: [{
    catalogId: "dumbbell_push_press", garminName: "Dumbbell Push Press", order: 0,
    planned: { sets: 2, reps: "", targetLoad: "", restSeconds: 0 }, skipped: false, note: "", substitutedFromId: null,
    sets: [
      { setNumber: 1, reps: 8, weightKg: 20, rpe: null, startedAt: 1000, endedAt: 31000, durationMs: 30000, repTimestamps: [], hrAvg: 100, hrMax: 110, skipped: false },
      { setNumber: 2, reps: 8, weightKg: 22, rpe: null, startedAt: 61000, endedAt: 89000, durationMs: 28000, repTimestamps: [], hrAvg: 130, hrMax: 140, skipped: false },
    ],
  }],
};

test("summarize de un import da reps, volumen, trabajo/descanso, FC y mapa NO vacíos (la costura)", () => {
  const s = summarize(imported);
  expect(s.totalReps).toBe(16);                       // 8 + 8, no 0
  expect(s.totalVolumeKg).toBe(8 * 20 + 8 * 22);      // 336, no 0
  expect(s.workMs).toBe(58000);                       // 30000 + 28000
  expect(s.restMs).toBeGreaterThan(0);                // descanso = total 120000 − work 58000
  expect(s.avgHr).not.toBeNull();                     // FC media de la sesión
  expect(s.perSet.length).toBe(2);                    // el detalle por serie no está vacío
  expect(s.primaryMuscles.length).toBeGreaterThan(0); // el mapa corporal se pinta (catalogId real → catálogo)
});
