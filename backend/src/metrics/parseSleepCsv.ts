import {
  METRIC_RANGES,
  MetricCsvPreviewSchema,
  type MetricType,
  type MetricCsvPreview,
  type BodyMetricEntry,
} from "@pulsia/shared";
import { splitCsvLine, localNoonEpoch } from "./csvUtils";

// Header (trim+lower) → metricType. La col 0 es la fecha (el header de Garmin la llama
// "Sleep Score 7 Days" por error) y se trata aparte. Columnas no mapeadas se ignoran
// (Quality, Bedtime, Wake Time).
const HEADER_TO_METRIC: Record<string, MetricType> = {
  score: "sleep_score",
  "resting heart rate": "resting_hr",
  "body battery": "body_battery",
  "pulse ox": "pulse_ox",
  respiration: "respiration",
  "hrv status": "hrv",
  duration: "sleep_hours",
  "sleep need": "sleep_need_hours",
};

// Métricas que vienen como "Xh Ymin" y se guardan en horas decimales.
const HM_METRICS = new Set<MetricType>(["sleep_hours", "sleep_need_hours"]);

// "7h 1min" → 7.0167 ; "9h 0min" → 9 ; "45min" → 0.75 ; "8h" → 8 ; null si no hay nada parseable.
export function parseHmToHours(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/i);
  if (!m || (m[1] == null && m[2] == null)) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h + min / 60;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSleepCsv(csv: string, offMin: number): MetricCsvPreview {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("El CSV no tiene filas de datos");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  // La col 0 es la fecha; el resto se mapea por nombre de header.
  const colMetric: (MetricType | null)[] = header.map((h, i) => (i === 0 ? null : HEADER_TO_METRIC[h] ?? null));

  const rows: MetricCsvPreview["rows"] = [];
  const skipped: MetricCsvPreview["skipped"] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const dateRaw = cells[0] ?? "";
    if (!ISO_DATE.test(dateRaw)) {
      skipped.push({ line: i + 1, reason: `La primera columna no es una fecha (YYYY-MM-DD): "${dateRaw}"` });
      continue;
    }
    const [y, mo, d] = dateRaw.split("-").map((n) => parseInt(n, 10));

    // Chequeo de fecha real contra los componentes de calendario parseados (no contra el
    // epoch ya desplazado por offMin, que podría cruzar de día y esconder una fecha inválida).
    const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
      skipped.push({ line: i + 1, reason: `Fecha de calendario inválida: "${dateRaw}"` });
      continue;
    }
    const measuredAt = localNoonEpoch(y, mo, d, offMin);

    const entries: BodyMetricEntry[] = [];
    for (let c = 1; c < header.length; c++) {
      const metric = colMetric[c];
      if (!metric) continue;
      const cell = (cells[c] ?? "").trim();
      if (cell === "") continue;
      const value = HM_METRICS.has(metric) ? parseHmToHours(cell) : Number(cell);
      if (value == null || !Number.isFinite(value)) continue;
      const [min, max] = METRIC_RANGES[metric];
      if (value < min || value > max) continue; // fuera de rango → se omite esa métrica
      entries.push({ metricType: metric, value });
    }

    if (entries.length === 0) {
      skipped.push({ line: i + 1, reason: "La fila no tiene ninguna métrica válida" });
      continue;
    }
    rows.push({ date: dateRaw, measuredAt, entries });
  }

  if (rows.length === 0) throw new Error("No se pudo leer ninguna noche del CSV");
  // Valida la forma de salida antes de devolver (mismo patrón que parseFit → Schema.parse).
  return MetricCsvPreviewSchema.parse({ rows, skipped });
}
