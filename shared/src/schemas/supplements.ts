import { z } from "zod";
import { FoodSourceSchema } from "./nutrition";

// Franjas del día, en orden canónico (el checklist agrupa en este orden).
export const TAKE_SLOTS = ["desayuno", "almuerzo", "cena", "post_entreno", "antes_de_dormir"] as const;
export const TakeSlotSchema = z.enum(TAKE_SLOTS);
export type TakeSlot = z.infer<typeof TakeSlotSchema>;

export const SupplementSourceSchema = FoodSourceSchema; // 'label' | 'estimate', misma semántica que comidas
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
    reason: z.string().trim().min(1),
  })
  .refine((a) => a.action !== "reduce" || (a.dose != null && a.dose.length > 0), {
    message: "reduce exige dose",
  });
export type AdjustmentItem = z.infer<typeof AdjustmentItemSchema>;
