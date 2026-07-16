import { useCallback, useEffect, useState } from "react";
import { getBackendUrl } from "../storage/config";
import { listMeals } from "../api/nutrition";
import type { Meal } from "@pulsia/shared";
import { dayBounds } from "./dayBounds";

export interface MealsRange {
  meals: Meal[];
  loading: boolean;
  error: string | null;
}

// Rango de `days` días que TERMINA en el día `offset` (offset positivo = pasado, convención del
// repo). `days = 1` colapsa al día solo. El -1 es porque el día del offset ya cuenta: 7 días
// son hoy + 6 atrás, no hoy + 7.
export function rangeBounds(days: number, offset: number): { from: number; to: number } {
  return { from: dayBounds(offset + days - 1).from, to: dayBounds(offset).to };
}

// Comidas de un rango. Distinto de useNutritionDay: no calcula metas ni gasto, solo trae comidas
// para rankear. Refetchea cuando cambian `days` u `offset`.
export function useMealsRange(days: number, offset: number): MealsRange {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = await getBackendUrl();
      const { from, to } = rangeBounds(days, offset);
      setMeals(await listMeals(url, from, to));
    } catch (e) {
      setError((e as Error).message);
      setMeals([]); // no dejar colgado el ranking del rango anterior si este falló
    }
    setLoading(false);
  }, [days, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { meals, loading, error };
}
