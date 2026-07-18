import { apiFetch } from "./client";
import type { BodyMetric, MetricReading, MetricType, MetricCsvPreview, MetricImportResult } from "@pulsia/shared";

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

export type GarminCsvKind = "sleep" | "weight" | "steps";

const GARMIN_CSV_PARSE_ERROR: Record<GarminCsvKind, string> = {
  sleep: "No se pudo leer el CSV de sueño",
  weight: "No se pudo leer el CSV de peso",
  steps: "No se pudo leer el CSV de pasos",
};

const GARMIN_CSV_IMPORT_ERROR: Record<GarminCsvKind, string> = {
  sleep: "No se pudo importar el sueño",
  weight: "No se pudo importar el peso",
  steps: "No se pudo importar los pasos",
};

// Manda el CSV de Garmin (base64) a parsear. Devuelve el preview SIN persistir; propaga el
// mensaje del backend en error (mismo patrón que parseFitCardio). Siempre manda el offset de
// huso horario del dispositivo para que el backend arme timestamps a mediodía local.
export async function parseGarminCsv(baseUrl: string, kind: GarminCsvKind, csvBase64: string): Promise<MetricCsvPreview> {
  const res = await apiFetch(baseUrl, `/metrics/import/${kind}/parse`, {
    method: "POST",
    body: JSON.stringify({ csvBase64, tzOffsetMinutes: new Date().getTimezoneOffset() }),
  });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || GARMIN_CSV_PARSE_ERROR[kind]);
  }
  return (await res.json()) as MetricCsvPreview;
}

// Importa el CSV de Garmin (dedupe en el backend). Devuelve conteos + preview usado.
export async function importGarminCsv(baseUrl: string, kind: GarminCsvKind, csvBase64: string): Promise<MetricImportResult> {
  const res = await apiFetch(baseUrl, `/metrics/import/${kind}`, {
    method: "POST",
    body: JSON.stringify({ csvBase64, tzOffsetMinutes: new Date().getTimezoneOffset() }),
  });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || GARMIN_CSV_IMPORT_ERROR[kind]);
  }
  return (await res.json()) as MetricImportResult;
}
