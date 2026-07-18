import {
  METRIC_RANGES,
  MetricCsvPreviewSchema,
  type MetricType,
  type MetricCsvPreview,
  type BodyMetricEntry,
} from "@pulsia/shared";
import { splitCsvLine, parseUnitNumber, localNoonEpoch } from "./csvUtils";

// Header (trim+lower) → metricType. La col 0 es la fecha (header vacío en el export de
// Garmin) y se trata aparte: NO se mapea por nombre.
const HEADER_TO_METRIC: Record<string, MetricType> = {
  actual: "steps",
  goal: "steps_goal",
};

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// CSV de pasos del export de Garmin: col 0 sin header, fecha MM/DD/AAAA.
export function parseStepsCsv(csv: string, offMin: number): MetricCsvPreview {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("El CSV no tiene filas de datos");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  // La col 0 es la fecha (header vacío); el resto se mapea por nombre de header.
  const colMetric: (MetricType | null)[] = header.map((h, i) => (i === 0 ? null : (HEADER_TO_METRIC[h] ?? null)));

  const rows: MetricCsvPreview["rows"] = [];
  const skipped: MetricCsvPreview["skipped"] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const dateRaw = cells[0] ?? "";
    const m = dateRaw.match(DATE_RE);
    if (!m) {
      skipped.push({ line: i + 1, reason: `La primera columna no es una fecha (MM/DD/AAAA): "${dateRaw}"` });
      continue;
    }
    const mo = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    const measuredAt = localNoonEpoch(y, mo, d, offMin);

    // Chequeo defensivo de fecha real (mismo patrón que parseSleepCsv): round-trip contra
    // los componentes UTC del instante construido.
    const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
      skipped.push({ line: i + 1, reason: `Fecha de calendario inválida: "${dateRaw}"` });
      continue;
    }

    const entries: BodyMetricEntry[] = [];
    for (let c = 1; c < header.length; c++) {
      const metric = colMetric[c];
      if (!metric) continue;
      const cell = (cells[c] ?? "").trim();
      if (cell === "") continue;
      const value = parseUnitNumber(cell);
      if (value == null) continue;
      const [min, max] = METRIC_RANGES[metric];
      if (value < min || value > max) continue; // fuera de rango → se omite esa métrica
      entries.push({ metricType: metric, value });
    }

    if (entries.length === 0) {
      skipped.push({ line: i + 1, reason: "La fila no tiene ninguna métrica válida" });
      continue;
    }

    const date = `${y}-${pad2(mo)}-${pad2(d)}`;
    rows.push({ date, measuredAt, entries });
  }

  if (rows.length === 0) throw new Error("No se pudo leer ningún día del CSV");
  return MetricCsvPreviewSchema.parse({ rows, skipped });
}
