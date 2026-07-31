import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useDateRange } from "./DateRangeContext";

export interface BodyMetric { id: string; metricType: string; value: number; measuredAt: number }

export function metricUrl(type: string, fromMs: number, toMs: number): string {
  return `/metrics?type=${type}&from=${Math.round(fromMs)}&to=${Math.round(toMs)}`;
}

export function useMetric(type: string) {
  const { fromMs, toMs } = useDateRange();
  return useQuery({
    queryKey: ["metric", type, Math.round(fromMs), Math.round(toMs)],
    queryFn: () => apiFetch<BodyMetric[]>(metricUrl(type, fromMs, toMs)),
  });
}
