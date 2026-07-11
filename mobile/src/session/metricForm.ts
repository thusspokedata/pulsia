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
