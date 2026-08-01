import { useQuery } from "@tanstack/react-query";
import type { Meal } from "@pulsia/shared";
import { apiFetch } from "../api/client";
import { useDateRange } from "../dashboard/DateRangeContext";

export function useMeals() {
  const { fromMs, toMs } = useDateRange();
  return useQuery({
    queryKey: ["meals", Math.round(fromMs), Math.round(toMs)],
    queryFn: () => apiFetch<Meal[]>(`/nutrition/meals?from=${Math.round(fromMs)}&to=${Math.round(toMs)}`),
  });
}
