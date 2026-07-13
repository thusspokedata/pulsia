import { BODY_METRIC_TYPES, BP_METRIC_TYPES, METRIC_RANGES, type MetricReading, type MetricType } from "@pulsia/shared";

export interface BuildReadingResult {
  reading: MetricReading | null;
  invalid: MetricType[];
  error?: string;
}

export function buildReadingFromForm(form: Partial<Record<MetricType, string>>, measuredAt: number): BuildReadingResult {
  // Composición corporal: reutiliza el builder genérico sobre BODY_METRIC_TYPES.
  return buildReadingForTypes(form, BODY_METRIC_TYPES, measuredAt);
}

export function buildReadingForTypes(
  form: Partial<Record<MetricType, string>>,
  types: readonly MetricType[],
  measuredAt: number,
): BuildReadingResult {
  const entries: { metricType: MetricType; value: number }[] = [];
  const invalid: MetricType[] = [];
  for (const t of types) {
    const raw = form[t]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    const [min, max] = METRIC_RANGES[t];
    if (!Number.isFinite(value) || value < min || value > max) { invalid.push(t); continue; }
    entries.push({ metricType: t, value });
  }
  return { reading: entries.length ? { measuredAt, entries } : null, invalid };
}

export interface BpForm {
  alta?: string;
  baja?: string;
  pulso?: string;
}

const BP_FORM_KEY_TO_METRIC: Record<keyof BpForm, MetricType> = {
  alta: BP_METRIC_TYPES[0],
  baja: BP_METRIC_TYPES[1],
  pulso: BP_METRIC_TYPES[2],
};

export function buildBpReadingFromForm(form: BpForm, measuredAt: number): BuildReadingResult {
  const entries: { metricType: MetricType; value: number }[] = [];
  const invalid: MetricType[] = [];
  for (const key of Object.keys(BP_FORM_KEY_TO_METRIC) as (keyof BpForm)[]) {
    const raw = form[key]?.trim();
    if (!raw) continue;
    const t = BP_FORM_KEY_TO_METRIC[key];
    const value = Number(raw);
    const [min, max] = METRIC_RANGES[t];
    if (!Number.isFinite(value) || value < min || value > max) {
      invalid.push(t);
      continue;
    }
    entries.push({ metricType: t, value });
  }
  // La presión alta (sistólica) debe ser mayor que la baja (diastólica) si vienen ambas.
  const sys = entries.find((e) => e.metricType === "bp_systolic");
  const dia = entries.find((e) => e.metricType === "bp_diastolic");
  if (sys && dia && sys.value <= dia.value) {
    return { reading: null, invalid, error: "La presión alta debe ser mayor que la baja" };
  }
  return { reading: entries.length ? { measuredAt, entries } : null, invalid };
}

// Precarga del "Registro diario": dado el cache de series por tipo y el mediodía del día
// seleccionado, devuelve los valores ya registrados ESE día (como strings, para los inputs).
// Match por día calendario [00:00, 24h). Si hay más de un punto en el día, toma el último.
export function valuesForDay(
  seriesByType: Partial<Record<MetricType, { value: number; measuredAt: number }[]>>,
  types: readonly MetricType[],
  dayNoonMs: number,
): Partial<Record<MetricType, string>> {
  const start = new Date(dayNoonMs);
  start.setHours(0, 0, 0, 0);
  const dayStart = start.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const out: Partial<Record<MetricType, string>> = {};
  for (const t of types) {
    const pts = seriesByType[t];
    if (!pts || pts.length === 0) continue;
    const last = pts
      .filter((p) => p.measuredAt >= dayStart && p.measuredAt < dayEnd)
      .sort((a, b) => a.measuredAt - b.measuredAt)
      .at(-1);
    if (last) out[t] = String(last.value);
  }
  return out;
}
