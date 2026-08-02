import { useQuery } from "@tanstack/react-query";
import type { SupplementMicrosResult } from "@pulsia/shared";
import { apiFetch } from "../api/client";
import { useDateRange } from "../dashboard/DateRangeContext";
import { localDayKey } from "../dashboard/heatmap";

export interface SupplementDaily {
  perDay: Record<string, SupplementMicrosResult>;
}

// Aporte de micros de suplementos por día del rango. OJO: este endpoint toma from/to como FECHAS
// (YYYY-MM-DD), no ms; sus claves de perDay son fechas calendario que alinean con localDayKey.
export function useSupplementDaily() {
  const { fromMs, toMs } = useDateRange();
  const from = localDayKey(fromMs);
  const to = localDayKey(toMs);
  return useQuery({
    queryKey: ["supp-range-daily", from, to],
    queryFn: () => apiFetch<SupplementDaily>(`/nutrition/supplements/range-nutrients-daily?from=${from}&to=${to}`),
  });
}
