// Barras de tiempo entrenado por día, últimas N semanas (default 4 = 28 días).

import { dateKey } from "./dateKey";

export interface DailyMinutes {
  date: string; // YYYY-MM-DD (fecha local)
  minutes: number;
}

// Recibe `nowMs` como input (no llama Date.now()) para que el resultado sea
// determinístico en tests. Devuelve exactamente `days` entradas, de la más
// vieja a la más nueva, terminando en el día de `nowMs`.
export function buildDailyMinutes(
  sessions: { startedAt: number; totalDurationMs: number | null }[],
  nowMs: number,
  days = 28
): DailyMinutes[] {
  const minutesByDate = new Map<string, number>();
  for (const s of sessions) {
    const key = dateKey(s.startedAt);
    const mins = (s.totalDurationMs ?? 0) / 60000;
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + mins);
  }

  const today = new Date(nowMs);
  const result: DailyMinutes[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d.getTime());
    result.push({ date: key, minutes: Math.round(minutesByDate.get(key) ?? 0) });
  }
  return result;
}
