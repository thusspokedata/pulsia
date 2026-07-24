import { z } from "zod";
import { AthleteContextSchema } from "./athlete";

// Franjas del día, en orden canónico (el checklist agrupa en este orden).
export const TAKE_SLOTS = ["desayuno", "almuerzo", "cena", "post_entreno", "antes_de_dormir"] as const;
export const TakeSlotSchema = z.enum(TAKE_SLOTS);
export type TakeSlot = z.infer<typeof TakeSlotSchema>;

// Los suplementos NO entran en la migración a USDA: no tienen micros por 100 g ni matcheo, así
// que se quedan con el par 'label' | 'estimate'. Antes era un alias de FoodSourceSchema; ese
// schema desapareció al partirse en sourceMacros/sourceMicros, y compartirlo habría arrastrado
// a los suplementos a una migración que no les toca.
export const SupplementSourceSchema = z.enum(["label", "estimate"]);
export type SupplementSource = z.infer<typeof SupplementSourceSchema>;
export const TakeStatusSchema = z.enum(["taken", "deviated", "skipped"]);
export type TakeStatus = z.infer<typeof TakeStatusSchema>;

export const SupplementComponentSchema = z.object({
  name: z.string().trim().min(1),   // "Magnesio (citrato)"
  amount: z.number().positive(),    // 375
  unit: z.string().trim().min(1),   // "mg"
});
export type SupplementComponent = z.infer<typeof SupplementComponentSchema>;

// Lo que la IA extrae de la foto (con explicación de componentes incluida).
export const SupplementExtractionSchema = z.object({
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1).nullish(),
  servingLabel: z.string().trim().min(1),           // "2 cápsulas", "5 g de polvo"
  components: z.array(SupplementComponentSchema).min(1),
  labelMaxPerDay: z.string().trim().min(1).nullish(), // texto de etiqueta
  source: SupplementSourceSchema,
  info: z.string().trim().min(1),                   // qué es y para qué sirve cada componente
});
export type SupplementExtraction = z.infer<typeof SupplementExtractionSchema>;

// Alta/edición (manual puede venir sin info; se genera después con "Explicar con IA").
export const SupplementInputSchema = SupplementExtractionSchema.extend({
  info: z.string().trim().min(1).nullish(),
  notes: z.string().nullish(),
});
export type SupplementInput = z.infer<typeof SupplementInputSchema>;

export const SupplementSchema = SupplementInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number().int(),
});
export type Supplement = z.infer<typeof SupplementSchema>;

// ---- Plan (se usa desde PR2, el schema se define ya para la migración 0016) ----
// OJO: AiPlanFrequencySchema (abajo) es un clon estructural SIN anchorDate — si agregás una variante, replicala allá.
// OJO 2: SCAN_DAYS en supplements/overlap.ts es el LCM de los períodos de estas variantes (2 y 7 → 14) —
// si agregás una variante con otro período, recalculalo allá.
export const FrequencySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  // anchorDate fija la paridad del "día por medio" (YYYY-MM-DD, fecha real).
  z.object({ type: z.literal("every_other_day"), anchorDate: z.iso.date() }),
  z.object({
    type: z.literal("weekdays"),
    // días 0-6, convención JS getDay(): 0 = domingo
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((d) => new Set(d).size === d.length, { message: "días duplicados" }),
  }),
]);
export type Frequency = z.infer<typeof FrequencySchema>;

export const PlanItemSchema = z.object({
  id: z.string().uuid(),
  supplementId: z.string().uuid(),
  slot: TakeSlotSchema,
  frequency: FrequencySchema,
  dose: z.string().trim().min(1),
  reason: z.string().nullish(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

// Ajuste del informe diario para MAÑANA. Solo skip/reduce — nunca increase (techo de seguridad).
export const AdjustmentItemSchema = z
  .object({
    supplementId: z.string().uuid(),
    action: z.enum(["skip", "reduce"]),
    dose: z.string().trim().min(1).nullish(), // solo para reduce
    reason: z.string().trim().min(1).max(200), // texto de la IA, acotado por higiene
  })
  .refine((a) => a.action !== "reduce" || (a.dose != null && a.dose.length > 0), {
    message: "reduce exige dose",
  });
export type AdjustmentItem = z.infer<typeof AdjustmentItemSchema>;

// --- Wire de PR2 (plan + checklist + tomas) ---

// Lo que devuelve la IA por ítem (sin id; el server los asigna). La frecuencia de la IA
// NO trae anchorDate: "día por medio" ancla al día de generación (lo pone el server).
export const AiPlanFrequencySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("every_other_day") }),
  z.object({
    type: z.literal("weekdays"),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((d) => new Set(d).size === d.length, { message: "días duplicados" }),
  }),
]);
export const AiPlanItemSchema = z.object({
  supplementId: z.string().uuid(),
  slot: TakeSlotSchema,
  frequency: AiPlanFrequencySchema,
  dose: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});
export type AiPlanItem = z.infer<typeof AiPlanItemSchema>;
export const AiPlanOutputSchema = z.object({ items: z.array(AiPlanItemSchema).min(1) });

export const GeneratePlanInputSchema = z.object({
  athleteContext: AthleteContextSchema,
  userNote: z.string().trim().min(1).nullish(),
  date: z.iso.date(), // "hoy" del dispositivo: ancla del every_other_day
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

// PATCH de un ítem a mano (franja/frecuencia/dosis; todo opcional pero al menos uno).
export const PlanItemPatchSchema = z
  .object({
    slot: TakeSlotSchema.optional(),
    frequency: FrequencySchema.optional(),
    dose: z.string().trim().min(1).optional(),
  })
  .refine((p) => p.slot !== undefined || p.frequency !== undefined || p.dose !== undefined);
export type PlanItemPatch = z.infer<typeof PlanItemPatchSchema>;

// Ítem del plan como lo devuelve el backend (join con el nombre del suplemento).
export const PlanItemViewSchema = PlanItemSchema.extend({ supplementName: z.string() });
export type PlanItemView = z.infer<typeof PlanItemViewSchema>;
export const PlanViewSchema = z.object({
  id: z.string().uuid(),
  userNote: z.string().nullish(),
  createdAt: z.number().int(),
  items: z.array(PlanItemViewSchema),
});
export type PlanView = z.infer<typeof PlanViewSchema>;

// Marcar una toma (upsert por userId+date+planItemId).
export const TakeInputSchema = z.object({
  date: z.iso.date(),
  planItemId: z.string().uuid(),
  status: TakeStatusSchema,
  actualDose: z.string().trim().min(1).nullish(), // solo tiene sentido en deviated
  note: z.string().nullish(),
});
export type TakeInput = z.infer<typeof TakeInputSchema>;
