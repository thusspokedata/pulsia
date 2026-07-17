import { apiFetch } from "./client";
import type { BodyMetric, MetricReading, MetricType, SleepCsvPreview, SleepImportResult } from "@pulsia/shared";

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

// Manda el CSV de sueño (base64) a parsear. Devuelve el preview SIN persistir; propaga el
// mensaje del backend en error (mismo patrón que parseFitCardio).
export async function parseSleepCsv(baseUrl: string, csvBase64: string): Promise<SleepCsvPreview> {
  const res = await apiFetch(baseUrl, "/metrics/import/sleep/parse", { method: "POST", body: JSON.stringify({ csvBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo leer el CSV de sueño");
  }
  return (await res.json()) as SleepCsvPreview;
}

// Importa el CSV de sueño (dedupe por noche en el backend). Devuelve conteos + preview usado.
export async function importSleepCsv(baseUrl: string, csvBase64: string): Promise<SleepImportResult> {
  const res = await apiFetch(baseUrl, "/metrics/import/sleep", { method: "POST", body: JSON.stringify({ csvBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo importar el sueño");
  }
  return (await res.json()) as SleepImportResult;
}
