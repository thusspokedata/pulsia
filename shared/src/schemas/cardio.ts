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
  kcalSource: CardioKcalSourceSchema,
  source: CardioSourceSchema,
  hrSeries: z.array(CardioHrPointSchema).optional(),
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
  hrSeries: z.array(CardioHrPointSchema).optional(),
});
export type CardioFitPreview = z.infer<typeof CardioFitPreviewSchema>;
