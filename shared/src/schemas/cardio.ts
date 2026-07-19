import { z } from "zod";
import { HrSeriesPointSchema } from "./session";

export const CARDIO_TYPES = ["walk", "run", "elliptical", "bike", "swim", "rowing", "other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

// Label de cada tipo de cardio. El `satisfies Record<CardioType, string>` fuerza exhaustividad: si
// se agrega una variante a CARDIO_TYPES y no se agrega acá, este archivo deja de compilar. Sin ese
// guard, la actividad del tipo nuevo se listaría con un label `undefined` en la UI.
export const CARDIO_LABELS = {
  walk: "Caminata",
  run: "Running",
  elliptical: "Elíptica",
  bike: "Bici",
  swim: "Natación",
  rowing: "Remo",
  other: "Otro",
} satisfies Record<CardioType, string>;

export const CardioTypeSchema = z.enum(CARDIO_TYPES);

// 'device' = las reportó el reloj/.FIT; 'estimate' = las calculamos nosotros.
export const CardioKcalSourceSchema = z.enum(["device", "estimate"]);
export type CardioKcalSource = z.infer<typeof CardioKcalSourceSchema>;

export const CardioSourceSchema = z.enum(["manual", "fit"]);
export type CardioSource = z.infer<typeof CardioSourceSchema>;

// Mismo shape que workout_session.hr_series (t = ms relativo a startedAt): el LineChart es
// compartido. Alias, no copia: si algún día cardio necesita divergir, se reemplaza acá por un
// z.object({...}) y nada más cambia, porque todo cardio ya referencia CardioHrPointSchema.
export const CardioHrPointSchema = HrSeriesPointSchema;
export type CardioHrPoint = z.infer<typeof CardioHrPointSchema>;

// Stream columnar: un array por canal, alineado por índice con `t`. Los huecos son null porque
// los canales son dispersos (la respiración aparece en ~1 de cada 3 records).
export const CardioSamplesSchema = z.object({
  t: z.array(z.number().int().min(0)),
  hr: z.array(z.number().nullable()).optional(),
  cad: z.array(z.number().nullable()).optional(),
  fracCad: z.array(z.number().nullable()).optional(),
  resp: z.array(z.number().nullable()).optional(),
  cycleLen: z.array(z.number().nullable()).optional(),
  // Campos que el SDK no sabe nombrar, guardados crudos y SIN interpretar (clave = nº de campo FIT).
  unknown: z.record(z.string(), z.array(z.number().nullable())).optional(),
});
export type CardioSamples = z.infer<typeof CardioSamplesSchema>;

export const CardioHrZonesSchema = z.object({
  secondsPerZone: z.array(z.number()),
  highBoundary: z.array(z.number()),
  maxHr: z.number().nullable(),
  restingHr: z.number().nullable(),
  thresholdHr: z.number().nullable(),
  calcType: z.string().nullable(),
});
export type CardioHrZones = z.infer<typeof CardioHrZonesSchema>;

export const CardioFitExtrasSchema = z.object({
  zones: CardioHrZonesSchema.optional(),
  athlete: z.record(z.string(), z.unknown()).optional(),
  devices: z.array(z.record(z.string(), z.unknown())).optional(),
  laps: z.array(z.record(z.string(), z.unknown())).optional(),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type CardioFitExtras = z.infer<typeof CardioFitExtrasSchema>;

// Tiempos en epoch ms (números), igual que WorkoutSessionSchema.
export const CardioActivitySchema = z.object({
  id: z.string().uuid(),
  type: CardioTypeSchema,
  startedAt: z.number().int(),
  durationMs: z.number().int().positive(),
  distanceM: z.number().int().min(0).nullable(),
  avgHr: z.number().int().min(0).nullable(),
  maxHr: z.number().int().min(0).nullable(),
  // Ascenso acumulado, no desnivel neto: es no-negativo por definición.
  elevationGainM: z.number().int().min(0).nullable(),
  kcal: z.number().int().min(0).nullable(),
  // Métricas extendidas del .FIT (Fase 1): todas optional+nullable — optional porque las
  // actividades manuales y las ya persistidas antes de esta feature no traen la clave; nullable
  // porque, igual que avgHr/maxHr, el reloj puede no reportar el dato aunque el resto del record sí.
  totalCycles: z.number().int().min(0).nullable().optional(),
  trainingLoad: z.number().min(0).nullable().optional(),
  trainingEffectAerobic: z.number().min(0).max(5).nullable().optional(),
  trainingEffectAnaerobic: z.number().min(0).max(5).nullable().optional(),
  avgCadence: z.number().min(0).nullable().optional(),
  maxCadence: z.number().min(0).nullable().optional(),
  avgFractionalCadence: z.number().min(0).nullable().optional(),
  avgRespiration: z.number().min(0).nullable().optional(),
  maxRespiration: z.number().min(0).nullable().optional(),
  minRespiration: z.number().min(0).nullable().optional(),
  metabolicKcal: z.number().int().min(0).nullable().optional(),
  // Metadata derivada del archivo, no una medición: o el parser la conoce (string/número) o
  // directamente omite la clave. Sin caso intermedio "se midió pero no hay dato" → sin nullable.
  sportProfileName: z.string().optional(),
  tzOffsetMinutes: z.number().int().optional(),
  kcalSource: CardioKcalSourceSchema,
  source: CardioSourceSchema,
  hrSeries: z.array(CardioHrPointSchema).optional(),
  samples: CardioSamplesSchema.optional(),
  fitExtras: CardioFitExtrasSchema.optional(),
  notes: z.string().default(""),
});
export type CardioActivity = z.infer<typeof CardioActivitySchema>;

// Preview del parseo de un .FIT: lo que midió el reloj, antes de confirmarse como actividad.
// No lleva id/source/kcalSource/notes — los agrega el móvil al confirmar (POST /cardio). `type`
// es la conjetura del parser a partir del `sport` del archivo; el usuario la corrige en el preview.
export const CardioFitPreviewSchema = z.object({
  type: CardioTypeSchema,
  startedAt: z.number().int(),
  durationMs: z.number().int().positive(),
  distanceM: z.number().int().min(0).nullable(),
  avgHr: z.number().int().min(0).nullable(),
  maxHr: z.number().int().min(0).nullable(),
  elevationGainM: z.number().int().min(0).nullable(),
  kcal: z.number().int().min(0).nullable(),
  totalCycles: z.number().int().min(0).nullable().optional(),
  trainingLoad: z.number().min(0).nullable().optional(),
  trainingEffectAerobic: z.number().min(0).max(5).nullable().optional(),
  trainingEffectAnaerobic: z.number().min(0).max(5).nullable().optional(),
  avgCadence: z.number().min(0).nullable().optional(),
  maxCadence: z.number().min(0).nullable().optional(),
  avgFractionalCadence: z.number().min(0).nullable().optional(),
  avgRespiration: z.number().min(0).nullable().optional(),
  maxRespiration: z.number().min(0).nullable().optional(),
  minRespiration: z.number().min(0).nullable().optional(),
  metabolicKcal: z.number().int().min(0).nullable().optional(),
  sportProfileName: z.string().optional(),
  tzOffsetMinutes: z.number().int().optional(),
  hrSeries: z.array(CardioHrPointSchema).optional(),
  samples: CardioSamplesSchema.optional(),
  fitExtras: CardioFitExtrasSchema.optional(),
});
export type CardioFitPreview = z.infer<typeof CardioFitPreviewSchema>;
