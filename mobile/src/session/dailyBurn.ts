// Gasto de ejercicio por día calendario (fecha LOCAL), sumando entrenamientos de fuerza y
// actividades de cardio. Alimenta el heatmap y las barras del tab Progreso.
//
// Usa los MISMOS primitivos que `dayExerciseBurn` (la fuente única del gasto que consume
// Nutrición) en vez de reimplementar la suma: dos funciones que suman gasto es cómo la pantalla
// y los informes terminan discrepando. El desglose fuerza/cardio se arma acá porque
// `dayExerciseBurn` solo devuelve el total.

import {
  estimateSessionBurn,
  estimateCardioBurn,
  type AthleteBurnArgs,
  type CardioType,
} from "@pulsia/shared";
import { dateKey } from "./dateKey";

export interface DayBurn {
  kcal: number; // total del día = strengthKcal + cardioKcal
  strengthKcal: number;
  cardioKcal: number;
  minutes: number; // tiempo total en movimiento, para el desglose al tocar una celda
}

export interface BurnSession {
  startedAt: number;
  totalDurationMs: number | null;
  avgHr: number | null;
}

export interface BurnActivity {
  type: CardioType;
  startedAt: number;
  durationMs: number;
  avgHr: number | null;
  kcal: number | null;
}

function emptyDay(): DayBurn {
  return { kcal: 0, strengthKcal: 0, cardioKcal: 0, minutes: 0 };
}

export function buildDailyBurn(
  sessions: BurnSession[],
  activities: BurnActivity[],
  athlete: AthleteBurnArgs,
): Map<string, DayBurn> {
  const byDate = new Map<string, DayBurn>();
  const dayFor = (ms: number): DayBurn => {
    const key = dateKey(ms);
    const existing = byDate.get(key);
    if (existing) return existing;
    const fresh = emptyDay();
    byDate.set(key, fresh);
    return fresh;
  };

  for (const s of sessions) {
    const day = dayFor(s.startedAt);
    const { kcal } = estimateSessionBurn({
      durationMs: s.totalDurationMs,
      avgHr: s.avgHr,
      ...athlete,
    });
    day.strengthKcal += kcal;
    day.kcal += kcal;
    day.minutes += (s.totalDurationMs ?? 0) / 60000;
  }

  for (const a of activities) {
    const day = dayFor(a.startedAt);
    const { kcal } = estimateCardioBurn(
      { type: a.type, durationMs: a.durationMs, avgHr: a.avgHr, kcal: a.kcal },
      athlete,
    );
    day.cardioKcal += kcal;
    day.kcal += kcal;
    day.minutes += a.durationMs / 60000;
  }

  for (const day of byDate.values()) day.minutes = Math.round(day.minutes);
  return byDate;
}
