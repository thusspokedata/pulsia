import { apiFetch } from "./client";
import type { PerformanceTrends } from "@pulsia/shared";

export async function getPerformance(baseUrl: string): Promise<PerformanceTrends> {
  const res = await apiFetch(baseUrl, "/progress/performance");
  if (!res.ok) throw new Error("No se pudo cargar el progreso");
  return (await res.json()) as PerformanceTrends;
}
