import { apiFetch } from "./client";
import type { BodyMetric, MetricReading, MetricType } from "@pulsia/shared";

export async function postReading(baseUrl: string, reading: MetricReading): Promise<BodyMetric[]> {
  const res = await apiFetch(baseUrl, "/metrics", { method: "POST", body: JSON.stringify(reading) });
  if (!res.ok) throw new Error("No se pudo guardar la medición");
  return (await res.json()) as BodyMetric[];
}

export async function getMetricSeries(baseUrl: string, type: MetricType): Promise<BodyMetric[]> {
  const res = await apiFetch(baseUrl, `/metrics?type=${type}`);
  if (!res.ok) throw new Error("No se pudieron cargar las métricas");
  return (await res.json()) as BodyMetric[];
}

export async function getLatestMetrics(baseUrl: string): Promise<Partial<Record<MetricType, { value: number; measuredAt: number }>>> {
  const res = await apiFetch(baseUrl, "/metrics/latest");
  if (!res.ok) throw new Error("No se pudieron cargar las métricas");
  return await res.json();
}

export async function deleteMetric(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/metrics/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("No se pudo borrar la medición");
}
