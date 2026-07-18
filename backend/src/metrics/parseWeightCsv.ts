import {
  METRIC_RANGES,
  MetricCsvPreviewSchema,
  type MetricType,
  type MetricCsvPreview,
  type BodyMetricEntry,
} from "@pulsia/shared";
import { splitCsvLine, parseUnitNumber, parse12hTime, localEpoch } from "./csvUtils";

// Header (trim+lower) → metricType. La col 0 es la hora (se trata aparte junto con la fecha
// de la fila anterior). "Change" y "BMI" no se mapean (no son métricas propias del sistema).
const HEADER_TO_METRIC: Record<string, MetricType> = {
  weight: "weight_kg",
  "body fat": "body_fat_pct",
  "skeletal muscle mass": "skeletal_muscle_mass_kg",
  "bone mass": "bone_mass_kg",
  "body water": "body_water_pct",
};

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const DATE_ROW = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// CSV jerárquico del export de peso de Garmin: una fila-fecha entrecomillada seguida de
// una o más filas de medición (varias pesadas por día no se colapsan: cada una es su propia
// fila con su propio measuredAt real).
export function parseWeightCsv(csv: string, offMin: number): MetricCsvPreview {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("El CSV no tiene filas de datos");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const colMetric: (MetricType | null)[] = header.map((h, i) =>
    i === 0 ? null : (HEADER_TO_METRIC[h] ?? null),
  );

  const rows: MetricCsvPreview["rows"] = [];
  const skipped: MetricCsvPreview["skipped"] = [];
  let curDate: { y: number; mo: number; d: number } | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const first = cells[0] ?? "";
    const dateMatch = first.match(DATE_ROW);

    if (dateMatch) {
      const mo = MONTHS[dateMatch[1]];
      const d = parseInt(dateMatch[2], 10);
      const y = parseInt(dateMatch[3], 10);
      if (!mo) {
        skipped.push({ line: i + 1, reason: `Mes no reconocido: "${first}"` });
        curDate = null;
        continue;
      }
      curDate = { y, mo, d };
      continue;
    }

    // Fila de medición.
    if (!curDate) {
      skipped.push({ line: i + 1, reason: "Fila de medición sin una fecha previa" });
      continue;
    }

    const time = parse12hTime(first);
    if (!time) {
      skipped.push({ line: i + 1, reason: `Hora inválida: "${first}"` });
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

    const { y, mo, d } = curDate;
    const measuredAt = localEpoch(y, mo, d, time.h, time.mi, offMin);
    const date = `${y}-${pad2(mo)}-${pad2(d)}`;
    const label = `${date} ${pad2(time.h)}:${pad2(time.mi)}`;
    rows.push({ date, measuredAt, entries, label });
  }

  if (rows.length === 0) throw new Error("No se pudo leer ninguna medición del CSV");
  return MetricCsvPreviewSchema.parse({ rows, skipped });
}
