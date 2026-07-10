// Heatmap anual estilo GitHub ("Días entrenados"). Suma minutos entrenados por día
// (fecha LOCAL, derivada de startedAt) y los bucketiza en niveles de intensidad.

import { dateKey } from "./dateKey";

export interface HeatmapCell {
  date: string; // YYYY-MM-DD (fecha local)
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  inYear: boolean;
  future: boolean; // día posterior a hoy (no se muestra en el año en curso)
}

export interface YearHeatmap {
  weeks: HeatmapCell[][]; // columnas = semanas (domingo→sábado), filas = 7 días
}

function levelFor(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 60) return 2;
  if (minutes <= 90) return 3;
  return 4;
}

// Años (desc, sin duplicados) que tienen al menos una sesión.
export function availableYears(sessions: { startedAt: number }[]): number[] {
  const years = new Set<number>();
  for (const s of sessions) years.add(new Date(s.startedAt).getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

// Construye la grilla del año dado. No usa Date.now(): recibe `year` como input
// para que el resultado sea determinístico en tests.
export function buildYearHeatmap(
  sessions: { startedAt: number; totalDurationMs: number | null }[],
  year: number,
  nowMs?: number
): YearHeatmap {
  // Si se pasa `nowMs`, las celdas de días posteriores a hoy se marcan `future`
  // (para no mostrar días que todavía no sucedieron en el año en curso).
  const todayKey = nowMs != null ? dateKey(nowMs) : null;
  const minutesByDate = new Map<string, number>();
  for (const s of sessions) {
    if (new Date(s.startedAt).getFullYear() !== year) continue;
    const key = dateKey(s.startedAt);
    const mins = (s.totalDurationMs ?? 0) / 60000;
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + mins);
  }

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const start = new Date(jan1);
  start.setDate(start.getDate() - start.getDay()); // domingo anterior o igual
  const end = new Date(dec31);
  end.setDate(end.getDate() + (6 - end.getDay())); // sábado posterior o igual
  // Si el año en curso no terminó, recortar la grilla a la semana de HOY: no generamos las
  // semanas futuras (evita una franja vacía a la derecha). Para años pasados no aplica.
  if (nowMs != null) {
    const today = new Date(nowMs);
    const todaySat = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    todaySat.setDate(todaySat.getDate() + (6 - todaySat.getDay())); // sábado de la semana de hoy
    if (todaySat < end) end.setTime(todaySat.getTime());
  }

  const weeks: HeatmapCell[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: HeatmapCell[] = [];
    for (let i = 0; i < 7; i++) {
      const inYear = cursor.getFullYear() === year;
      const key = dateKey(cursor.getTime());
      const rawMinutes = inYear ? minutesByDate.get(key) ?? 0 : 0;
      const minutes = Math.round(rawMinutes);
      const future = todayKey != null && key > todayKey;
      week.push({ date: key, minutes, level: levelFor(minutes), inYear, future });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks };
}
