import { z } from "zod";

export const BODY_METRIC_TYPES = [
  "weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
  "bone_mass_kg", "body_water_pct", "waist_cm",
] as const;

export const BP_METRIC_TYPES = ["bp_systolic", "bp_diastolic", "bp_pulse"] as const;

export const METRIC_TYPES = [...BODY_METRIC_TYPES, ...BP_METRIC_TYPES] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const MetricTypeSchema = z.enum(METRIC_TYPES);

export const METRIC_UNITS: Record<MetricType, string> = {
  weight_kg: "kg", body_fat_pct: "%", skeletal_muscle_mass_kg: "kg",
  bone_mass_kg: "kg", body_water_pct: "%", waist_cm: "cm",
  bp_systolic: "mmHg", bp_diastolic: "mmHg", bp_pulse: "bpm",
};

export const METRIC_LABELS: Record<MetricType, string> = {
  weight_kg: "Peso", body_fat_pct: "% grasa", skeletal_muscle_mass_kg: "Masa muscular",
  bone_mass_kg: "Masa ósea", body_water_pct: "Agua corporal", waist_cm: "Cintura",
  bp_systolic: "Presión alta", bp_diastolic: "Presión baja", bp_pulse: "Pulso",
};

// Rangos sanos para atajar typos de carga (no son límites médicos).
export const METRIC_RANGES: Record<MetricType, [number, number]> = {
  weight_kg: [20, 400], body_fat_pct: [2, 70], skeletal_muscle_mass_kg: [5, 100],
  bone_mass_kg: [0.5, 10], body_water_pct: [20, 80], waist_cm: [30, 250],
  bp_systolic: [60, 260], bp_diastolic: [30, 160], bp_pulse: [30, 220],
};

export const BodyMetricEntrySchema = z
  .object({ metricType: MetricTypeSchema, value: z.number() })
  .refine(
    (e) => {
      const [min, max] = METRIC_RANGES[e.metricType];
      return e.value >= min && e.value <= max;
    },
    { message: "valor fuera de rango para la métrica" },
  );
export type BodyMetricEntry = z.infer<typeof BodyMetricEntrySchema>;

// Payload de carga: una lectura (fecha común) con N métricas. measuredAt en epoch ms
// (convención del resto de la app; ver workoutSession.startedAt).
export const MetricReadingSchema = z
  .object({
    measuredAt: z.number().int().optional(),
    entries: z.array(BodyMetricEntrySchema).min(1),
  })
  .refine(
    (r) => new Set(r.entries.map((e) => e.metricType)).size === r.entries.length,
    { message: "métrica duplicada en la lectura", path: ["entries"] },
  )
  .refine(
    (r) => {
      // Si vienen ambas presiones, la sistólica (alta) debe ser mayor que la diastólica (baja).
      const sys = r.entries.find((e) => e.metricType === "bp_systolic");
      const dia = r.entries.find((e) => e.metricType === "bp_diastolic");
      return !sys || !dia || sys.value > dia.value;
    },
    { message: "la presión alta debe ser mayor que la baja", path: ["entries"] },
  );
export type MetricReading = z.infer<typeof MetricReadingSchema>;

// Fila persistida / devuelta por el backend.
export const BodyMetricSchema = z.object({
  id: z.string().uuid(),
  metricType: MetricTypeSchema,
  value: z.number(),
  measuredAt: z.number().int(),
});
export type BodyMetric = z.infer<typeof BodyMetricSchema>;
