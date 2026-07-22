import type { Sex } from "../schemas/profile";
import type { CardioType } from "../schemas/cardio";

const MET_STRENGTH = 5; // MET genérico de entrenamiento de fuerza (fallback sin FC)

// MET por tipo de actividad (Compendium of Physical Activities). El fallback sin FC:
// una caminata a 3.5 MET gasta ~40% menos que los 5 MET genéricos de fuerza.
export const MET_BY_CARDIO = {
  walk: 3.5,
  run: 9.8,
  elliptical: 5.0,
  bike: 7.5,
  swim: 7.0,
  rowing: 7.0,
  other: 5.0,
} satisfies Record<CardioType, number>;

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

// Núcleo compartido: Keytel si hay FC+edad, si no MET (el MET lo elige el llamador).
function burnFrom(args: SessionBurnArgs & { met: number }): SessionBurn {
  const { durationMs, avgHr, met, weightKg, age, sex, bmr } = args;
  if (durationMs == null || durationMs <= 0 || weightKg == null) return { kcal: 0, method: "none" };
  const minutes = durationMs / 60000;
  let gross: number;
  let method: "hr" | "met";
  if (avgHr != null && age != null) {
    gross = keytelPerMin(avgHr, weightKg, age, sex) * minutes;
    method = "hr";
  } else {
    gross = met * weightKg * (minutes / 60);
    method = "met";
  }
  const kcal = bmr != null ? Math.max(0, gross - (bmr / 1440) * minutes) : gross;
  return { kcal: Math.round(kcal), method };
}

export function estimateSessionBurn(args: SessionBurnArgs): SessionBurn {
  return burnFrom({ ...args, met: MET_STRENGTH });
}

export interface CardioBurn { kcal: number; method: "device" | "hr" | "met" | "none" }
export interface CardioBurnInput {
  type: CardioType;
  durationMs: number;
  avgHr: number | null;
  kcal: number | null; // kcal del reloj (.FIT); si está, manda
}
export type AthleteBurnArgs = { weightKg?: number; age?: number; sex?: Sex; bmr?: number | null };

// El reloj le gana a la fórmula: mide con acelerómetro + FC + perfil. Pero reporta el gasto
// BRUTO del intervalo (incluye el metabolismo basal de ese rato), mientras que `burnFrom` deja
// la fuerza en NETO. Sin este ajuste las dos ramas no son comparables y el BMR de la actividad
// se cuenta dos veces: la meta diaria ya lo incluye por las 24 h.
export function estimateCardioBurn(a: CardioBurnInput, athlete: AthleteBurnArgs): CardioBurn {
  if (a.kcal != null) {
    const minutes = a.durationMs / 60000;
    const net = athlete.bmr != null ? a.kcal - (athlete.bmr / 1440) * minutes : a.kcal;
    // El schema garantiza kcal >= 0, pero la RESTA puede dar negativo (actividad larga y muy
    // suave). Sin el clamp, un día de cardio le restaría meta al usuario en vez de sumarle.
    return { kcal: Math.round(Math.max(0, net)), method: "device" };
  }
  return burnFrom({ durationMs: a.durationMs, avgHr: a.avgHr, met: MET_BY_CARDIO[a.type], ...athlete });
}

// Gasto del día = fuerza + cardio. Única fuente del gasto de ejercicio: dos funciones que suman
// gasto es cómo la pantalla y los informes terminan discrepando.
export function dayExerciseBurn(
  sessions: { totalDurationMs: number | null; avgHr: number | null }[],
  activities: CardioBurnInput[],
  athlete: AthleteBurnArgs,
): number {
  const strength = sessions.reduce(
    (a, s) => a + estimateSessionBurn({ durationMs: s.totalDurationMs, avgHr: s.avgHr, ...athlete }).kcal,
    0,
  );
  return activities.reduce((a, act) => a + estimateCardioBurn(act, athlete).kcal, strength);
}
