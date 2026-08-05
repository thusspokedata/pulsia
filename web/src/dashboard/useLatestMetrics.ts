import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export type LatestMetrics = Record<string, { value: number; measuredAt: number } | undefined>;

// GET /metrics/latest → último valor por tipo de métrica. El heatmap de gasto usa weight_kg:
// misma fuente que el móvil, donde el "peso actual" es la última medición, no el del perfil.
export function useLatestMetrics() {
  return useQuery({ queryKey: ["metrics-latest"], queryFn: () => apiFetch<LatestMetrics>("/metrics/latest") });
}
