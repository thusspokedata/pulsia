// Barras de gasto calórico por día, últimas N semanas (default 4 = 28 días). El agrupamiento por
// día lo hace `dailyBurn.ts`; acá solo se recorta la ventana y se rellenan los días sin actividad.

import { dateKey } from "./dateKey";
import type { DayBurn } from "./dailyBurn";

export interface DailyKcal {
  date: string; // YYYY-MM-DD (fecha local)
  kcal: number;
}

// Recibe `nowMs` como input (no llama Date.now()) para que el resultado sea determinístico en
// tests. Devuelve exactamente `days` entradas, de la más vieja a la más nueva, terminando en el
// día de `nowMs`. Los días sin actividad van en 0 y NO se omiten: el eje tiene que estar completo.
export function buildDailyKcal(
  burnByDate: Map<string, DayBurn>,
  nowMs: number,
  days = 28
): DailyKcal[] {
  const today = new Date(nowMs);
  const result: DailyKcal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d.getTime());
    result.push({ date: key, kcal: burnByDate.get(key)?.kcal ?? 0 });
  }
  return result;
}
