// Heatmap anual estilo GitHub ("Días entrenados y gasto"). El color mide GASTO CALÓRICO del día
// (fuerza + cardio), no minutos: una caminata de 2 h y una sesión de pesas de 50 min ocupan
// tiempos muy distintos para esfuerzos parecidos. El gasto por día lo arma `dailyBurn.ts`.

import { dateKey } from "./dateKey";
import type { DayBurn } from "./dailyBurn";

export interface HeatmapCell {
  date: string; // YYYY-MM-DD (fecha local)
  kcal: number;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  inYear: boolean;
  future: boolean; // día posterior a hoy (no se muestra en el año en curso)
}

export interface YearHeatmap {
  weeks: HeatmapCell[][]; // columnas = semanas (domingo→sábado), filas = 7 días
}

// Los umbrales llegan como INPUT (calculados sobre todo el historial en `burnThresholds.ts`), no
// se derivan acá: calcularlos por año haría que el mismo día cambie de color según el año que
// estés mirando.
function levelFor(kcal: number, [t1, t2, t3]: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (kcal <= 0) return 0;
  if (kcal <= t1) return 1;
  if (kcal <= t2) return 2;
  if (kcal <= t3) return 3;
  return 4;
}

// Años (desc, sin duplicados) con al menos una sesión de fuerza O una actividad de cardio.
export function availableYears(
  sessions: { startedAt: number }[],
  activities: { startedAt: number }[] = []
): number[] {
  const years = new Set<number>();
  for (const s of sessions) years.add(new Date(s.startedAt).getFullYear());
  for (const a of activities) years.add(new Date(a.startedAt).getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

// Construye la grilla del año dado. No usa Date.now(): recibe `year` como input
// para que el resultado sea determinístico en tests.
export function buildYearHeatmap(
  burnByDate: Map<string, DayBurn>,
  thresholds: [number, number, number],
  year: number,
  nowMs?: number
): YearHeatmap {
  // Si se pasa `nowMs`, las celdas de días posteriores a hoy se marcan `future`
  // (para no mostrar días que todavía no sucedieron en el año en curso).
  const todayKey = nowMs != null ? dateKey(nowMs) : null;

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const start = new Date(jan1);
  start.setDate(start.getDate() - start.getDay()); // domingo anterior o igual
  const end = new Date(dec31);
  end.setDate(end.getDate() + (6 - end.getDay())); // sábado posterior o igual
  // Solo el año EN CURSO se recorta a la semana de HOY (no generamos semanas futuras → sin franja
  // vacía a la derecha). Años pasados: completo. Años futuros (sesión con fecha adelantada): completo
  // — sin el guard, el recorte movería `end` al año actual y la grilla quedaría vacía.
  if (nowMs != null) {
    const today = new Date(nowMs);
    if (today.getFullYear() === year) {
      const todaySat = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      todaySat.setDate(todaySat.getDate() + (6 - todaySat.getDay())); // sábado de la semana de hoy
      if (todaySat < end) end.setTime(todaySat.getTime());
    }
  }

  const weeks: HeatmapCell[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: HeatmapCell[] = [];
    for (let i = 0; i < 7; i++) {
      const inYear = cursor.getFullYear() === year;
      const key = dateKey(cursor.getTime());
      const day = inYear ? burnByDate.get(key) : undefined;
      const kcal = day?.kcal ?? 0;
      const future = todayKey != null && key > todayKey;
      week.push({
        date: key,
        kcal,
        minutes: day?.minutes ?? 0,
        level: levelFor(kcal, thresholds),
        inYear,
        future,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks };
}
