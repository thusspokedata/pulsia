import type { Sex } from "../schemas/profile";

const MET_STRENGTH = 5; // MET genérico de entrenamiento de fuerza (fallback sin FC)

export interface SessionBurnArgs {
  durationMs: number | null;
  avgHr: number | null;
  weightKg?: number;
  age?: number;
  sex?: Sex;
  bmr?: number | null; // si está, el gasto es NETO (se resta el BMR de la duración)
}
export interface SessionBurn { kcal: number; method: "hr" | "met" | "none" }

// Keytel et al. 2005: kcal/min desde FC + peso + edad, por sexo; "otro"/sin sexo → promedio.
const keytelPerMin = (hr: number, w: number, age: number, sex?: Sex): number => {
  const male = (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184;
  const female = (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
  const perMin = sex === "male" ? male : sex === "female" ? female : (male + female) / 2;
  return Math.max(0, perMin); // FC muy baja puede dar negativo
};

export function estimateSessionBurn(args: SessionBurnArgs): SessionBurn {
  const { durationMs, avgHr, weightKg, age, sex, bmr } = args;
  if (durationMs == null || durationMs <= 0 || weightKg == null) return { kcal: 0, method: "none" };
  const minutes = durationMs / 60000;
  let gross: number;
  let method: "hr" | "met";
  if (avgHr != null && age != null) {
    gross = keytelPerMin(avgHr, weightKg, age, sex) * minutes;
    method = "hr";
  } else {
    gross = MET_STRENGTH * weightKg * (minutes / 60);
    method = "met";
  }
  const kcal = bmr != null ? Math.max(0, gross - (bmr / 1440) * minutes) : gross;
  return { kcal: Math.round(kcal), method };
}

export function sumDayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  athlete: { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null },
): number {
  // Suma de enteros (cada sesión ya redondea) → no hace falta redondear de nuevo.
  return sessions.reduce(
    (a, s) => a + estimateSessionBurn({ durationMs: s.totalDurationMs, avgHr: s.avgHr, ...athlete }).kcal,
    0,
  );
}
